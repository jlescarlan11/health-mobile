import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdaptiveUI } from '../../hooks/useAdaptiveUI';
import { Text } from './Text';

interface StandardHeaderProps {
  title: string;
  showBackButton?: boolean;
  onBackPress?: () => void;
  backRoute?: string;
  rightActions?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
}

export const StandardHeader: React.FC<StandardHeaderProps> = ({
  title,
  showBackButton = false,
  onBackPress,
  backRoute,
  rightActions,
  style,
  titleStyle,
}) => {
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { scaleFactor, isPWDMode, touchTargetScale } = useAdaptiveUI();

  const handleBackPress = () => {
    if (onBackPress) {
      onBackPress();
    } else if (navigation.canGoBack()) {
      navigation.goBack();
    } else if (backRoute) {
      navigation.navigate(backRoute as never);
    }
  };

  const headerHeight = isPWDMode ? 70 : 60;
  const backButtonStyle = [
    styles.backButton,
    isPWDMode && {
      padding: 12,
      borderRadius: 12,
      backgroundColor: '#F3F0EB',
    },
  ];

  const containerStyle = [
    styles.container,
    {
      backgroundColor: theme.colors.surface,
      borderBottomColor: isPWDMode ? theme.colors.primary : theme.colors.outlineVariant,
      paddingTop: insets.top,
      paddingHorizontal: isPWDMode ? 20 : 16,
      paddingBottom: isPWDMode ? 10 : 6,
      height: headerHeight + insets.top,
    },
    style,
  ];

  const titleStyles = [
    styles.title,
    {
      fontSize: 18 * scaleFactor * (isPWDMode ? 1.1 : 1),
      color: theme.colors.onSurface,
    },
    titleStyle,
  ];

  const iconSize = 24 * touchTargetScale;

  return (
    <View style={containerStyle}>
      <View style={styles.leftContainer}>
        {showBackButton && (
          <TouchableOpacity
            onPress={handleBackPress}
            style={backButtonStyle}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            accessibilityHint="Navigates to the previous screen"
          >
            <Ionicons name="arrow-back" size={iconSize} color={theme.colors.onSurface} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.titleContainer}>
        <Text
          style={titleStyles}
          accessibilityRole="header"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
      </View>
      <View style={styles.rightContainer}>{rightActions}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  leftContainer: {
    width: '20%',
    alignItems: 'flex-start',
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightContainer: {
    width: '20%',
    alignItems: 'flex-end',
  },
  backButton: {
    padding: 6,
    marginLeft: -6,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
