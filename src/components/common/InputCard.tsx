import React, { useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, KeyboardTypeOptions } from 'react-native';
import { TextInput, IconButton, useTheme } from 'react-native-paper';
import { useAdaptiveUI } from '../../hooks/useAdaptiveUI';

interface InputCardProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  label?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  containerStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export interface InputCardRef {
  focus: () => void;
  blur: () => void;
  isFocused: () => boolean;
}

export const InputCard = forwardRef<InputCardRef, InputCardProps>((props, ref) => {
  const {
    value,
    onChangeText,
    onSubmit,
    placeholder,
    label,
    onFocus,
    onBlur,
    maxLength,
    keyboardType,
    autoCapitalize,
    containerStyle,
    disabled = false,
  } = props;

  const theme = useTheme();
  const { scaleFactor, touchTargetScale } = useAdaptiveUI();
  const inputRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    isFocused: () => inputRef.current?.isFocused() || false,
  }));

  const hasText = value.trim().length > 0;

  const dynamicInputStyle = {
    fontSize: 15 * scaleFactor,
    lineHeight: 20 * scaleFactor,
    minHeight: Math.max(40, 40 * scaleFactor),
  };

  const actionIconSize = 24 * touchTargetScale;
  const actionButtonSize = 40 * touchTargetScale;

  return (
    <View style={[styles.container, containerStyle]}>
      <View style={styles.inputWrapper}>
        <TextInput
          ref={inputRef}
          mode="outlined"
          label={label}
          placeholder={placeholder}
          multiline
          maxLength={maxLength}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          onFocus={onFocus}
          onBlur={onBlur}
          style={[styles.textInput, dynamicInputStyle, { backgroundColor: 'transparent' }]}
          contentStyle={styles.textContent}
          outlineStyle={[styles.outline, { borderColor: theme.colors.outline }]}
          cursorColor={theme.colors.primary}
          selectionColor={theme.colors.primary + '40'}
          dense
          disabled={disabled}
        />
      </View>

      <View style={styles.actionContainer}>
        <IconButton
          icon="send"
          testID="send-button"
          size={actionIconSize}
          iconColor={theme.colors.primary}
          onPress={onSubmit}
          style={[
            styles.sendButton,
            {
              backgroundColor: theme.colors.primaryContainer,
              width: actionButtonSize,
              height: actionButtonSize,
              borderRadius: actionButtonSize / 2,
            },
          ]}
          disabled={disabled || !hasText}
        />
      </View>
    </View>
  );
});

InputCard.displayName = 'InputCard';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  inputWrapper: {
    flex: 1,
  },
  textInput: {
    maxHeight: 100,
    backgroundColor: 'transparent',
  },
  textContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  outline: {
    borderRadius: 24,
    borderWidth: 1,
  },
  actionContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButton: {
    margin: 0,
  },
});
