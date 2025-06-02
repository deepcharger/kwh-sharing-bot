// src/utils/messages/formatters/DateFormatter.js

class DateFormatter {
    /**
     * Format date in Italian locale
     */
    static formatDate(date, options = {}) {
        if (!date || !(date instanceof Date)) {
            return 'N/A';
        }
        
        const defaultOptions = {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        };
        
        return date.toLocaleDateString('it-IT', { ...defaultOptions, ...options });
    }

    /**
     * Format time in Italian locale
     */
    static formatTime(date, options = {}) {
        if (!date || !(date instanceof Date)) {
            return 'N/A';
        }
        
        const defaultOptions = {
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return date.toLocaleTimeString('it-IT', { ...defaultOptions, ...options });
    }

    /**
     * Format date and time
     */
    static formatDateTime(date) {
        if (!date || !(date instanceof Date)) {
            return 'N/A';
        }
        
        return `${this.formatDate(date)} alle ${this.formatTime(date)}`;
    }

    /**
     * Format relative time (e.g., "2 ore fa")
     */
    static formatRelativeTime(date) {
        if (!date || !(date instanceof Date)) {
            return 'N/A';
        }
        
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'ora';
        if (diffMins < 60) return `${diffMins} minut${diffMins === 1 ? 'o' : 'i'} fa`;
        if (diffHours < 24) return `${diffHours} or${diffHours === 1 ? 'a' : 'e'} fa`;
        if (diffDays < 7) return `${diffDays} giorn${diffDays === 1 ? 'o' : 'i'} fa`;
        
        // For older dates, return the actual date
        return this.formatDate(date);
    }

    /**
     * Format time remaining (e.g., "2 ore")
     */
    static formatTimeRemaining(targetDate) {
        if (!targetDate || !(targetDate instanceof Date)) {
            return 'N/A';
        }
        
        const now = new Date();
        const diffMs = targetDate - now;
        
        if (diffMs <= 0) return 'SCADUTO';
        
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 60) return `${diffMins} minut${diffMins === 1 ? 'o' : 'i'}`;
        if (diffHours < 24) return `${diffHours} or${diffHours === 1 ? 'a' : 'e'}`;
        return `${diffDays} giorn${diffDays === 1 ? 'o' : 'i'}`;
    }

    /**
     * Format duration between two dates
     */
    static formatDuration(startDate, endDate) {
        if (!startDate || !endDate) return 'N/A';
        
        const start = startDate instanceof Date ? startDate : new Date(startDate);
        const end = endDate instanceof Date ? endDate : new Date(endDate);
        
        const diffMs = Math.abs(end - start);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 60) {
            return `${diffMins} minut${diffMins === 1 ? 'o' : 'i'}`;
        } else if (diffHours < 24) {
            const mins = diffMins % 60;
            return `${diffHours}h ${mins}min`;
        } else {
            const hours = diffHours % 24;
            return `${diffDays}g ${hours}h`;
        }
    }

    /**
     * Format day of week
     */
    static formatDayOfWeek(date) {
        if (!date || !(date instanceof Date)) {
            return 'N/A';
        }
        
        const days = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        return days[date.getDay()];
    }

    /**
     * Format month name
     */
    static formatMonth(date) {
        if (!date || !(date instanceof Date)) {
            return 'N/A';
        }
        
        const months = [
            'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
        ];
        return months[date.getMonth()];
    }

    /**
     * Format date for display in messages
     */
    static formatMessageDate(date) {
        if (!date || !(date instanceof Date)) {
            return 'N/A';
        }
        
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        
        if (isToday) {
            return `Oggi alle ${this.formatTime(date)}`;
        } else if (isYesterday) {
            return `Ieri alle ${this.formatTime(date)}`;
        } else {
            return this.formatDateTime(date);
        }
    }

    /**
     * Parse Italian date format
     */
    static parseItalianDate(dateString) {
        // Expected format: DD/MM/YYYY HH:MM
        const regex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/;
        const match = dateString.match(regex);
        
        if (!match) {
            return null;
        }
        
        const [_, day, month, year, hour, minute] = match;
        const date = new Date(year, month - 1, day, hour, minute);
        
        // Validate the date
        if (isNaN(date.getTime())) {
            return null;
        }
        
        return date;
    }

    /**
     * Format date range
     */
    static formatDateRange(startDate, endDate) {
        if (!startDate || !endDate) return 'N/A';
        
        const start = startDate instanceof Date ? startDate : new Date(startDate);
        const end = endDate instanceof Date ? endDate : new Date(endDate);
        
        if (start.toDateString() === end.toDateString()) {
            // Same day
            return `${this.formatDate(start)} dalle ${this.formatTime(start)} alle ${this.formatTime(end)}`;
        } else {
            // Different days
            return `Dal ${this.formatDateTime(start)} al ${this.formatDateTime(end)}`;
        }
    }

    /**
     * Format timestamp for logs
     */
    static formatTimestamp(date = new Date()) {
        return date.toISOString();
    }

    /**
     * Check if date is expired
     */
    static isExpired(date) {
        if (!date || !(date instanceof Date)) {
            return true;
        }
        
        return date < new Date();
    }

    /**
     * Get time until expiry
     */
    static getTimeUntilExpiry(expiryDate) {
        if (!expiryDate || !(expiryDate instanceof Date)) {
            return null;
        }
        
        const now = new Date();
        const diffMs = expiryDate - now;
        
        if (diffMs <= 0) {
            return { expired: true, remaining: 0 };
        }
        
        return {
            expired: false,
            remaining: diffMs,
            formatted: this.formatTimeRemaining(expiryDate)
        };
    }

    /**
     * Format business hours
     */
    static formatBusinessHours(availability) {
        // Parse common patterns like "Lun-Ven 8:00-18:00"
        const patterns = {
            'Sempre disponibile': '24/7',
            'Lun-Ven': 'Lunedì-Venerdì',
            'Lun-Sab': 'Lunedì-Sabato',
            'Weekend': 'Sabato-Domenica'
        };
        
        let formatted = availability;
        for (const [pattern, replacement] of Object.entries(patterns)) {
            formatted = formatted.replace(pattern, replacement);
        }
        
        return formatted;
    }
}

module.exports = DateFormatter;
