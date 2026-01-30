import React from 'react';
import {
  StyleSheet,
  View,
  Modal as RNModal,
  TouchableWithoutFeedback,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Surface, useTheme, IconButton } from 'react-native-paper';

interface ModalProps {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  dismissable?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  visible,
  onDismiss,
  children,
  contentContainerStyle,
  dismissable = true,
}) => {
  const theme = useTheme();

  return (
    <RNModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismissable ? onDismiss : undefined}
    >
      <TouchableWithoutFeedback onPress={dismissable ? onDismiss : undefined}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <Surface
              style={[
                styles.content,
                { backgroundColor: theme.colors.surface },
                contentContainerStyle,
              ]}
            >
              {dismissable && (
                <IconButton icon="close" size={24} onPress={onDismiss} style={styles.closeButton} />
              )}
              {children}
            </Surface>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </RNModal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxWidth: 500,
    elevation: 4,
  },
  closeButton: {
    position: 'absolute',
    right: 4,
    top: 4,
    zIndex: 1,
  },
});
