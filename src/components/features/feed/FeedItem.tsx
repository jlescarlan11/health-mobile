import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, useTheme, IconButton } from 'react-native-paper';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useAdaptiveUI } from '../../../hooks/useAdaptiveUI';
import { sharingUtils } from '../../../utils/sharingUtils';
import { FeedItem as FeedItemType } from '../../../types/feed';

export interface FeedItemData {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: string;
  timestamp: string;
  imageUrl?: string;
  url?: string;
}

interface FeedItemProps {
  item: FeedItemData | FeedItemType;
  onPress?: () => void;
}

export const FeedItem: React.FC<FeedItemProps> = ({ item, onPress }) => {
  const theme = useTheme();
  const { scaleFactor } = useAdaptiveUI();

  // Unified data mapping
  const title = item.title;
  const description = 'description' in item ? item.description : item.excerpt;
  const category = 'category' in item ? item.category : (item.categories[0] || 'Health');
  const imageUrl = item.imageUrl;
  
  let timestamp = '';
  if ('timestamp' in item) {
    timestamp = item.timestamp;
  } else if (item.dateISO) {
    try {
      timestamp = formatDistanceToNow(parseISO(item.dateISO), { addSuffix: true });
    } catch {
      timestamp = item.dateISO.split('T')[0];
    }
  }

  return (
    <Card
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          shadowColor: theme.colors.shadow,
        },
      ]}
      onPress={onPress}
      mode="contained"
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={`${category}: ${title}. ${description}`}
    >
      {imageUrl && (
        <Card.Cover source={{ uri: imageUrl }} style={styles.cardImage} />
      )}
      <Card.Content style={styles.cardContent}>
        <Text
          variant="titleMedium"
          numberOfLines={2}
          style={[styles.titleText, { fontSize: 18 * scaleFactor, lineHeight: 24 * scaleFactor }]}
        >
          {title}
        </Text>

        <Text
          variant="bodySmall"
          numberOfLines={2}
          style={[
            styles.descriptionText,
            { fontSize: 14 * scaleFactor, lineHeight: 20 * scaleFactor },
          ]}
        >
          {description}
        </Text>

        <View style={styles.footerRow}>
          <Text variant="labelSmall" style={styles.timestampText}>
            {timestamp}
          </Text>

          <IconButton
            icon="share-variant-outline"
            size={20 * scaleFactor}
            onPress={(e) => {
              e.stopPropagation();
              sharingUtils.shareHealthTip(item);
            }}
            style={styles.shareIconButton}
            iconColor={theme.colors.primary}
            accessibilityLabel={`Share ${title}`}
          />
        </View>
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    elevation: 2,
    borderWidth: 0,
    overflow: 'hidden',
  },
  cardImage: {
    height: 160,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cardContent: {
    flexDirection: 'column',
    padding: 16,
  },
  timestampText: {
    color: '#888',
    fontWeight: '500',
  },
  titleText: {
    fontWeight: '800',
    marginBottom: 8,
    color: '#1F2937',
    letterSpacing: -0.5,
  },
  descriptionText: {
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shareIconButton: {
    margin: 0,
  },
});
