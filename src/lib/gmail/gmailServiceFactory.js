/**
 * Gmail Service Factory
 * Initializes and manages Gmail API authentication
 * Handles OAuth2 token refresh and credential management
 */

import { google } from 'googleapis';

class GmailServiceFactory {
  constructor() {
    this.gmailAuth = null;
    this.lastInitialization = null;
    this.initializationRetries = 0;
    this.MAX_RETRIES = 3;
  }

  /**
   * Get or create authenticated Gmail client
   * @returns {Promise<Object|null>} Authenticated Gmail client or null if failed
   */
  async getAuthenticatedClient() {
    try {
      // Return cached client if available and recent
      if (this.gmailAuth && this.lastInitialization) {
        const age = Date.now() - this.lastInitialization;
        if (age < 3600000) { // 1 hour
          console.log('Using cached Gmail auth');
          return this.gmailAuth;
        }
      }

      // Initialize new client
      this.gmailAuth = await this._initializeGmailAuth();
      this.lastInitialization = Date.now();
      this.initializationRetries = 0;

      return this.gmailAuth;
    } catch (error) {
      console.error('Gmail auth error:', error.message);

      // Retry logic
      if (this.initializationRetries < this.MAX_RETRIES) {
        this.initializationRetries++;
        console.log(`Retry ${this.initializationRetries}/${this.MAX_RETRIES}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * this.initializationRetries));
        return this.getAuthenticatedClient();
      }

      return null;
    }
  }

  /**
   * Initialize Gmail API authentication
   * @private
   * @returns {Promise<Object>} Authenticated Gmail API object
   */
  async _initializeGmailAuth() {
    // Get credentials from environment
    const credentials = this._getCredentials();

    if (!credentials) {
      throw new Error(
        'Gmail credentials not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN'
      );
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
      credentials.redirect_uri || 'http://localhost:3000/api/auth/google/callback'
    );

    // Set refresh token
    if (credentials.refresh_token) {
      oauth2Client.setCredentials({
        refresh_token: credentials.refresh_token,
      });
    } else {
      throw new Error('Gmail refresh token not configured');
    }

    // Verify connection by making a test call
    const gmail = google.gmail({
      version: 'v1',
      auth: oauth2Client,
    });

    try {
      await gmail.users.messages.list({
        userId: 'me',
        maxResults: 1,
      });
      console.log('✓ Gmail authentication successful');
    } catch (error) {
      throw new Error(`Gmail API verification failed: ${error.message}`);
    }

    return gmail;
  }

  /**
   * Get Gmail credentials from environment
   * @private
   * @returns {Object|null} Credentials object or null if not configured
   */
  _getCredentials() {
    const required = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'];

    // Check all required env vars
    for (const key of required) {
      if (!process.env[key]) {
        console.warn(`Missing environment variable: ${key}`);
        return null;
      }
    }

    return {
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
      redirect_uri: process.env.GMAIL_REDIRECT_URI,
    };
  }

  /**
   * Clear cached authentication
   */
  clearCache() {
    this.gmailAuth = null;
    this.lastInitialization = null;
    this.initializationRetries = 0;
    console.log('Gmail auth cache cleared');
  }

  /**
   * Check if Gmail is configured
   * @returns {Boolean} True if credentials are configured
   */
  isConfigured() {
    return !!(
      process.env.GMAIL_CLIENT_ID &&
      process.env.GMAIL_CLIENT_SECRET &&
      process.env.GMAIL_REFRESH_TOKEN
    );
  }

  /**
   * Get configuration status
   * @returns {Object} Configuration status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      cached: !!this.gmailAuth,
      lastInit: this.lastInitialization ? new Date(this.lastInitialization) : null,
      retries: this.initializationRetries,
    };
  }
}

// Singleton instance
const factory = new GmailServiceFactory();

export default factory;

// Named exports for convenience
export const getGmailClient = () => factory.getAuthenticatedClient();
export const clearGmailCache = () => factory.clearCache();
export const isGmailConfigured = () => factory.isConfigured();
export const getGmailStatus = () => factory.getStatus();
