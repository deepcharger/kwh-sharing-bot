const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const axios = require('axios');

class ImageProcessor {
    constructor() {
        this.maxImageSize = process.env.MAX_IMAGE_SIZE || 5242880; // 5MB default
        this.tesseractLang = process.env.TESSERACT_LANG || 'ita+eng';
    }

    async downloadImage(bot, fileId) {
        try {
            // Get file info from Telegram
            const fileInfo = await bot.telegram.getFile(fileId);
            const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${fileInfo.file_path}`;
            
            // Download image
            const response = await axios({
                method: 'get',
                url: fileUrl,
                responseType: 'arraybuffer'
            });

            // Check file size
            if (response.data.length > this.maxImageSize) {
                throw new Error('File troppo grande. Massimo 5MB.');
            }

            return Buffer.from(response.data);
        } catch (error) {
            console.error('Errore download immagine:', error);
            throw new Error('Impossibile scaricare l\'immagine');
        }
    }

    async preprocessImage(imageBuffer) {
        try {
            // Preprocessing with Sharp for better OCR
            const processedImage = await sharp(imageBuffer)
                .resize({ 
                    width: 1200, 
                    height: 1200, 
                    fit: 'inside',
                    withoutEnlargement: true 
                })
                .greyscale()
                .normalize()
                .sharpen()
                .png()
                .toBuffer();

            return processedImage;
        } catch (error) {
            console.error('Errore preprocessing immagine:', error);
            return imageBuffer; // Return original if preprocessing fails
        }
    }

    async extractTextFromImage(imageBuffer) {
        try {
            const processedImage = await this.preprocessImage(imageBuffer);
            
            const { data: { text } } = await Tesseract.recognize(
                processedImage,
                this.tesseractLang,
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                        }
                    }
                }
            );

            return text;
        } catch (error) {
            console.error('Errore OCR:', error);
            throw new Error('Impossibile leggere il testo dall\'immagine');
        }
    }

    extractKwhFromText(text) {
        try {
            // Patterns per riconoscere KWH nelle varie forme
            const kwhPatterns = [
                // Pattern italiani
                /(\d+[,.]?\d*)\s*kwh/i,
                /(\d+[,.]?\d*)\s*kw\/h/i,
                /kwh[:\s]*(\d+[,.]?\d*)/i,
                /energia[:\s]*(\d+[,.]?\d*)/i,
                /erogata[:\s]*(\d+[,.]?\d*)/i,
                /consumo[:\s]*(\d+[,.]?\d*)/i,
                
                // Pattern generici
                /(\d+[,.]?\d*)\s*kw\s*h/i,
                /(\d+[,.]?\d*)\s*kilowatt/i,
                /totale[:\s]*(\d+[,.]?\d*)/i,
                
                // Pattern per display colonnine specifiche
                /energy[:\s]*(\d+[,.]?\d*)/i,
                /delivered[:\s]*(\d+[,.]?\d*)/i,
                /session[:\s]*(\d+[,.]?\d*)/i
            ];

            const detectedValues = [];

            for (const pattern of kwhPatterns) {
                const matches = text.match(pattern);
                if (matches) {
                    const value = matches[1].replace(',', '.');
                    const kwhValue = parseFloat(value);
                    
                    // Valida che sia un valore ragionevole (tra 0.1 e 200 KWH)
                    if (!isNaN(kwhValue) && kwhValue > 0.1 && kwhValue <= 200) {
                        detectedValues.push(kwhValue);
                    }
                }
            }

            // Rimuovi duplicati e ordina
            const uniqueValues = [...new Set(detectedValues)].sort((a, b) => b - a);
            
            return {
                detectedValues: uniqueValues,
                mostLikelyValue: uniqueValues[0] || null,
                confidence: uniqueValues.length > 0 ? 'high' : 'low',
                rawText: text
            };

        } catch (error) {
            console.error('Errore estrazione KWH:', error);
            return {
                detectedValues: [],
                mostLikelyValue: null,
                confidence: 'low',
                rawText: text,
                error: error.message
            };
        }
    }

    async validateKwhImage(bot, fileId, declaredKwh, tolerance = 0.15) {
        try {
            console.log(`🔍 Validazione foto KWH: dichiarato ${declaredKwh}`);
            
            // Download e processa immagine
            const imageBuffer = await this.downloadImage(bot, fileId);
            const extractedText = await this.extractTextFromImage(imageBuffer);
            
            console.log('📝 Testo estratto:', extractedText.substring(0, 200) + '...');
            
            // Estrai valori KWH
            const kwhData = this.extractKwhFromText(extractedText);
            
            console.log('⚡ Valori KWH rilevati:', kwhData.detectedValues);
            console.log('🎯 Valore più probabile:', kwhData.mostLikelyValue);
            
            if (!kwhData.mostLikelyValue) {
                return {
                    isValid: false,
                    confidence: 'low',
                    reason: 'Nessun valore KWH rilevato nell\'immagine',
                    detectedKwh: null,
                    declaredKwh,
                    rawText: extractedText,
                    needsManualReview: true
                };
            }

            const detectedKwh = kwhData.mostLikelyValue;
            const difference = Math.abs(detectedKwh - declaredKwh);
            const percentageDiff = (difference / declaredKwh) * 100;
            
            const isValid = percentageDiff <= (tolerance * 100);
            
            console.log(`📊 Confronto: Dichiarato ${declaredKwh}, Rilevato ${detectedKwh}, Diff ${percentageDiff.toFixed(1)}%`);
            
            return {
                isValid,
                confidence: kwhData.confidence,
                reason: isValid ? 'Valori corrispondenti' : `Discrepanza del ${percentageDiff.toFixed(1)}%`,
                detectedKwh,
                declaredKwh,
                percentageDifference: percentageDiff,
                tolerance: tolerance * 100,
                allDetectedValues: kwhData.detectedValues,
                rawText: extractedText,
                needsManualReview: !isValid || kwhData.confidence === 'low'
            };

        } catch (error) {
            console.error('Errore validazione immagine:', error);
            return {
                isValid: false,
                confidence: 'low',
                reason: `Errore nell'elaborazione: ${error.message}`,
                detectedKwh: null,
                declaredKwh,
                needsManualReview: true,
                error: error.message
            };
        }
    }

    async saveImageData(imageBuffer, transactionId) {
        try {
            // In un'implementazione reale, salveresti l'immagine su cloud storage
            // Per ora salviamo solo metadata nel database
            
            const imageInfo = await sharp(imageBuffer).metadata();
            
            return {
                transactionId,
                format: imageInfo.format,
                width: imageInfo.width,
                height: imageInfo.height,
                size: imageBuffer.length,
                savedAt: new Date()
            };
        } catch (error) {
            console.error('Errore salvataggio dati immagine:', error);
            return null;
        }
    }

    isImageFile(mimeType) {
        const allowedTypes = [
            'image/jpeg',
            'image/jpg', 
            'image/png',
            'image/webp'
        ];
        return allowedTypes.includes(mimeType);
    }

    getImageValidationRules() {
        return {
            maxSize: this.maxImageSize,
            allowedFormats: ['JPEG', 'PNG', 'WebP'],
            recommendations: [
                'Scatta la foto direttamente al display',
                'Assicurati che i numeri siano ben visibili',
                'Evita riflessi e ombre',
                'La foto deve essere nitida',
                'Include tutto il display nella foto'
            ]
        };
    }
}

module.exports = ImageProcessor;
