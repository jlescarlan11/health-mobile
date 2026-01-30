import * as Sharing from 'expo-sharing';
import { Share, Platform, Alert } from 'react-native';
import { Facility } from '../types';
import { FeedItemData } from '../components/features/feed/FeedItem';
import { FeedItem } from '../types/feed';

/**
 * Interface for the result of a sharing operation
 */
export interface ShareResult {
  success: boolean;
  error?: string;
}

/**
 * Basic Health Tip interface for sharing if not using FeedItemData
 */
export interface HealthTip {
  title: string;
  description: string;
  category?: string;
}

/**
 * Standardizes sharing functionality across the app.
 * Wraps expo-sharing for files and React Native Share for text.
 */
export const sharingUtils = {
  /**
   * Checks if sharing is available on the current device.
   * On web, this usually returns false.
   */
  async isSharingAvailable(): Promise<boolean> {
    try {
      return await Sharing.isAvailableAsync();
    } catch {
      return false;
    }
  },

  /**
   * Shares a health tip with a standardized message format.
   * Uses React Native's Share API for text-based sharing.
   * 
   * @param tip The health tip data to share (supports FeedItemData, FeedItem or a basic HealthTip object)
   * @returns A promise resolving to a ShareResult
   */
  async shareHealthTip(tip: FeedItemData | FeedItem | HealthTip): Promise<ShareResult> {
    try {
      const description = 'description' in tip ? tip.description : (tip as FeedItem).excerpt;
      const url = 'url' in tip ? `\n\nRead more: ${tip.url}` : '';

      const message = `🏥 Health Tip from Naga City HEALTH App\n\n` +
        `📌 ${tip.title}\n\n` +
        `${description}${url}\n\n` +
        `Stay safe and informed! #NagaCityHealth`;

      await Share.share({
        message,
        title: tip.title,
      });

      return { success: true };
    } catch (error) {
      console.error('Error sharing health tip:', error);
      return { success: false, error: String(error) };
    }
  },

  /**
   * Shares facility information with a standardized message format.
   * 
   * @param facility The facility data to share
   * @returns A promise resolving to a ShareResult
   */
  async shareFacilityInfo(facility: Facility): Promise<ShareResult> {
    try {
      const message = `🏥 Healthcare Facility Info (Naga City HEALTH App)\n\n` +
        `🏢 ${facility.name}\n` +
        `📍 Address: ${facility.address}\n` +
        (facility.phone ? `📞 Contact: ${facility.phone}\n` : '') +
        (facility.hours ? `⏰ Hours: ${facility.hours}\n` : '') +
        `✨ Services: ${facility.services.join(', ')}\n\n` +
        `Found via the HEALTH app. #NagaCityHealth`;

      await Share.share({
        message,
        title: facility.name,
      });

      return { success: true };
    } catch (error) {
      console.error('Error sharing facility info:', error);
      return { success: false, error: String(error) };
    }
  },

  /**
   * Shares a clinical report or assessment summary.
   * 
   * @param title Title of the report
   * @param content Formatted text content of the report
   * @returns A promise resolving to a ShareResult
   */
  async shareReport(title: string, content: string): Promise<ShareResult> {
    try {
      const message = `📋 Clinical Report from Naga City HEALTH App\n\n` +
        `📅 Date: ${new Date().toLocaleString()}\n\n` +
        `${content}\n\n` +
        `Shared via the HEALTH app. #NagaCityHealth`;

      await Share.share({
        message,
        title,
      });

      return { success: true };
    } catch (error) {
      console.error('Error sharing clinical report:', error);
      return { success: false, error: String(error) };
    }
  },

  /**
   * Shares a local file using expo-sharing.
   * Useful for sharing generated PDFs or reports.
   * 
   * @param fileUri Local URI to the file (e.g., from expo-file-system or expo-print)
   * @param options Optional expo-sharing configuration (mimeType, UTI, dialogTitle)
   * @returns A promise resolving to a ShareResult
   */
  async shareFile(fileUri: string, options: Sharing.SharingOptions = {}): Promise<ShareResult> {
    const isAvailable = await this.isSharingAvailable();

    if (!isAvailable) {
      const errorMsg = 'Sharing is not available on this device';
      if (Platform.OS !== 'web') {
        Alert.alert('Unavailable', errorMsg);
      }
      return { success: false, error: errorMsg };
    }

    try {
      await Sharing.shareAsync(fileUri, options);
      return { success: true };
    } catch (error) {
      console.error('Error sharing file:', error);
      return { success: false, error: String(error) };
    }
  }
};
