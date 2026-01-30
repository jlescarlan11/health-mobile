import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';

import { CommunicationHub } from './CommunicationHub';
import { Button } from './Button';
import { FacilityContact } from '../../types';
import { useAdaptiveUI } from '../../hooks/useAdaptiveUI';

interface FacilityActionButtonsProps {
  contacts?: FacilityContact[];
  primaryPhone?: string;
  onDirectionsPress: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  callButtonStyle?: StyleProp<ViewStyle>;
  directionButtonStyle?: StyleProp<ViewStyle>;
  directionButtonTitle?: string;
  directionButtonIcon?: string;
}

export const FacilityActionButtons: React.FC<FacilityActionButtonsProps> = ({
  contacts,
  primaryPhone,
  onDirectionsPress,
  containerStyle,
  callButtonStyle,
  directionButtonStyle,
  directionButtonTitle = 'Directions',
  directionButtonIcon = 'directions',
}) => {
  const { isPWDMode, simplifiedSpacing } = useAdaptiveUI();
  const sharedButtonBaseStyle = [styles.sharedButton, isPWDMode && styles.pwdSharedButton];
  const actionContainerStyles = [
    styles.actionsContainer,
    { marginTop: isPWDMode ? simplifiedSpacing / 2 : 8 },
    containerStyle,
  ];
  const secondSlotStyle = [
    styles.actionSlot,
    styles.secondSlot,
    isPWDMode && { marginLeft: simplifiedSpacing / 2 },
  ];

  return (
    <View style={actionContainerStyles}>
      <View style={styles.actionSlot}>
        <CommunicationHub
          contacts={contacts}
          primaryPhone={primaryPhone}
          callButtonStyle={[...sharedButtonBaseStyle, callButtonStyle]}
        />
      </View>
      <View style={secondSlotStyle}>
        <Button
          icon={directionButtonIcon}
          title={directionButtonTitle}
          onPress={onDirectionsPress}
          variant="primary"
          style={[...sharedButtonBaseStyle, directionButtonStyle]}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  actionSlot: {
    flex: 1,
  },
  secondSlot: {
    marginLeft: 12,
  },
  sharedButton: {
    flex: 1,
  },
  pwdSharedButton: {
    marginVertical: 6,
  },
});
