import React from 'react';
import { View, StyleSheet, Linking, Platform } from 'react-native';
import { Text, useTheme, Surface, IconButton } from 'react-native-paper';
import { SlideToCall } from './SlideToCall';

interface EmergencyActionsProps {
  onCallInitiated?: (number: string) => void;
  variant?: 'light' | 'dark';
}

export const EmergencyActions: React.FC<EmergencyActionsProps> = ({
  onCallInitiated,
  variant = 'dark',
}) => {
  const theme = useTheme();

  const handleCall = (number: string) => {
    const cleanNumber = number.replace(/[^\d+]/g, '');
    const url = Platform.OS === 'android' ? `tel:${cleanNumber}` : `telprompt:${cleanNumber}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
          onCallInitiated?.(number);
        }
      })
      .catch((err) => console.error('Error opening dialer:', err));
  };

  const isDark = variant === 'dark';
  const subtextColor = isDark ? theme.colors.onError : theme.colors.onSurfaceVariant;
  const dividerLineColor = isDark ? 'rgba(255,255,255,0.2)' : theme.colors.outlineVariant;

  return (
    <View style={styles.container}>
      <SlideToCall
        onSwipeComplete={() => handleCall('911')}
        label="Slide to call 911"
        containerStyle={styles.slideToCall}
      />

      <View style={styles.divider}>
        <View style={[styles.line, { backgroundColor: dividerLineColor }]} />
        <Text style={[styles.dividerText, { color: subtextColor }]}>OR CONTACT LOCAL SERVICES</Text>
        <View style={[styles.line, { backgroundColor: dividerLineColor }]} />
      </View>

      <Surface
        style={[
          styles.contactCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
        elevation={1}
      >
        <View style={styles.contactInfo}>
          <Text style={[styles.contactName, { color: theme.colors.onSurface }]}>
            NCGH Emergency
          </Text>
          <Text style={[styles.contactPhone, { color: theme.colors.onSurfaceVariant }]}>
            (054) 473-3111
          </Text>
        </View>
        <IconButton
          icon="phone"
          mode="contained"
          containerColor="#C84848"
          iconColor={theme.colors.onError}
          onPress={() => handleCall('(054) 473-3111')}
        />
      </Surface>

      <Surface
        style={[
          styles.contactCard,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
        elevation={1}
      >
        <View style={styles.contactInfo}>
          <Text style={[styles.contactName, { color: theme.colors.onSurface }]}>
            Mental Health Crisis
          </Text>
          <Text style={[styles.contactPhone, { color: theme.colors.onSurfaceVariant }]}>1553</Text>
        </View>
        <IconButton
          icon="phone"
          mode="contained"
          containerColor="#C84848"
          iconColor={theme.colors.onError}
          onPress={() => handleCall('1553')}
        />
      </Surface>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  slideToCall: {
    marginBottom: 20,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  line: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 12,
    letterSpacing: 1,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: '#E0E2E3',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  contactPhone: {
    fontSize: 13,
    marginTop: 2,
  },
});
