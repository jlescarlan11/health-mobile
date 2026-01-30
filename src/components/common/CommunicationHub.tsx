import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
  Modal,
  FlatList,
  Text,
  StyleProp,
  ViewStyle,
  useWindowDimensions,
  Pressable,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Surface, useTheme, IconButton } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from './Button';
import { FacilityContact } from '../../types';
import { openViber, openMessenger } from '../../utils/linkingUtils';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface CommunicationHubProps {
  contacts?: FacilityContact[];
  primaryPhone?: string;
  callButtonStyle?: StyleProp<ViewStyle>;
}

interface ContactItem {
  value: string;
  platform: 'phone' | 'email' | 'viber' | 'messenger';
  contactName?: string | null;
  id?: string;
}

export const CommunicationHub: React.FC<CommunicationHubProps> = ({
  contacts = [],
  primaryPhone,
  callButtonStyle,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const MAX_MODAL_HEIGHT_RATIO = 0.5;
  const modalMaxHeight = windowHeight * MAX_MODAL_HEIGHT_RATIO;
  const listMaxHeight = Math.max(modalMaxHeight - 140, 48);
  const [modalVisible, setModalVisible] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(windowHeight)).current;

  const phoneContacts = contacts.filter((c) => c.platform === 'phone');
  const emailContacts = contacts.filter((c) => c.platform === 'email');
  const viberContacts = contacts.filter((c) => c.platform === 'viber');
  const messengerContacts = contacts.filter((c) => c.platform === 'messenger');

  const hasPhone = phoneContacts.length > 0 || !!primaryPhone;
  const hasEmail = emailContacts.length > 0;
  const hasViber = viberContacts.length > 0;
  const hasMessenger = messengerContacts.length > 0;

  const contactEntries: ContactItem[] = [
    ...phoneContacts.map((c) => ({
      value: c.phoneNumber,
      platform: 'phone' as const,
      contactName: c.contactName,
      id: c.id,
    })),
    ...emailContacts.map((c) => ({
      value: c.phoneNumber,
      platform: 'email' as const,
      contactName: c.contactName,
      id: c.id,
    })),
  ];

  const openContact = (contact: ContactItem) => {
    const url = contact.platform === 'email' ? `mailto:${contact.value}` : `tel:${contact.value}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(
        'Error',
        `Failed to open ${contact.platform === 'email' ? 'email client' : 'dialer'}.`,
      ),
    );
  };

  const showModal = () => {
    setModalVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 90,
    }).start();
  };

  const hideModal = () => {
    Animated.timing(slideAnim, {
      toValue: windowHeight,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setModalVisible(false);
    });
  };

  const handleContactAction = () => {
    if (contactEntries.length > 1) {
      showModal();
    } else if (contactEntries.length === 1) {
      openContact(contactEntries[0]);
    } else if (primaryPhone) {
      Linking.openURL(`tel:${primaryPhone}`).catch(() =>
        Alert.alert('Error', 'Failed to open dialer.'),
      );
    } else {
      Alert.alert('Not Available', 'Contact information is not available.');
    }
  };

  const handleViberAction = async () => {
    if (viberContacts.length > 0) {
      const success = await openViber(viberContacts[0].phoneNumber);
      if (!success) {
        Alert.alert('Error', 'Viber is not installed or the number is invalid.');
      }
    }
  };

  const handleMessengerAction = async () => {
    if (messengerContacts.length > 0) {
      const success = await openMessenger(messengerContacts[0].phoneNumber);
      if (!success) {
        Alert.alert('Error', 'Messenger is not installed or the link is invalid.');
      }
    }
  };

  const allContacts = contactEntries;

  const contactButtonMode: 'phone' | 'email' | 'viber' | 'messenger' | 'multiple' = (() => {
    if (contactEntries.length === 1) {
      return contactEntries[0].platform;
    }
    if (contactEntries.length === 0 && primaryPhone) {
      return 'phone';
    }
    return 'multiple';
  })();

  const contactButtonLabel =
    contactButtonMode === 'phone'
      ? 'Call'
      : contactButtonMode === 'email'
        ? 'Email'
        : contactButtonMode === 'viber'
          ? 'Viber'
          : contactButtonMode === 'messenger'
            ? 'Messenger'
            : 'Contacts';

  const contactButtonIcon =
    contactButtonMode === 'phone'
      ? 'phone-outline'
      : contactButtonMode === 'email'
        ? 'email-outline'
        : contactButtonMode === 'viber'
          ? 'phone'
          : contactButtonMode === 'messenger'
            ? 'facebook-messenger'
            : 'account-group-outline';

  return (
    <View style={styles.container}>
      <Button
        icon={contactButtonIcon}
        title={contactButtonLabel}
        onPress={handleContactAction}
        style={[styles.callButton, callButtonStyle]}
        variant="primary"
        disabled={!hasPhone && !hasEmail}
      />

      {(hasViber || hasMessenger) && (
        <View style={styles.iconRow}>
          {hasViber && (
            <TouchableOpacity
              testID="viber-button"
              style={[styles.iconButton, { backgroundColor: '#7360f2' }]}
              onPress={handleViberAction}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name={'phone' as IconName} size={24} color="#fff" />
            </TouchableOpacity>
          )}

          {hasMessenger && (
            <TouchableOpacity
              testID="messenger-button"
              style={[styles.iconButton, { backgroundColor: '#0084ff' }]}
              onPress={handleMessengerAction}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons name="facebook-messenger" size={24} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={hideModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={hideModal} />
          <Animated.View
            style={[
              styles.modalContent,
              {
                backgroundColor: theme.colors.surface,
                maxHeight: modalMaxHeight,
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.colors.onSurface }]}>
              Select Contact
            </Text>
            <FlatList
              data={allContacts}
              keyExtractor={(item, index) => item.id || index.toString()}
              style={{ maxHeight: listMaxHeight }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 4, paddingHorizontal: 24 }}
              renderItem={({ item }) => (
                <Surface
                  style={[
                    styles.contactOptionSurface,
                    {
                      backgroundColor: theme.colors.surface,
                      borderColor: theme.colors.outlineVariant,
                    },
                  ]}
                  elevation={1}
                >
                  <View style={styles.contactOptionContent}>
                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactName, { color: '#000000' }]}>
                        {item.contactName || (item.platform === 'email' ? 'Email' : 'Phone')}
                      </Text>
                      <Text
                        style={[styles.contactNumber, { color: theme.colors.onSurfaceVariant }]}
                      >
                        {item.value}
                      </Text>
                    </View>
                    <IconButton
                      icon={item.platform === 'email' ? 'email' : 'phone'}
                      mode="contained"
                      containerColor={theme.colors.primary}
                      iconColor={theme.colors.onPrimary}
                      size={24}
                      onPress={() => {
                        const url =
                          item.platform === 'email'
                            ? `mailto:${item.value}`
                            : `tel:${item.value}`;
                        Linking.openURL(url);
                        hideModal();
                      }}
                    />
                  </View>
                </Surface>
              )}
            />
            <Button
              variant="outline"
              onPress={hideModal}
              title="Cancel"
              style={{ marginTop: 16, marginHorizontal: 24 }}
            />
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  callButton: {
    flex: 1,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    width: '100%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  contactOptionSurface: {
    borderRadius: 12,
    marginVertical: 6,
    borderWidth: 0.5,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
  },
  contactOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  contactNumber: {
    fontSize: 13,
    marginTop: 2,
  },
});
