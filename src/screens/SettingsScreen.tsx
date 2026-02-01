import React, { useMemo, useCallback } from 'react';
import { StyleSheet, ScrollView, View, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { useTheme, List, Surface, Divider, Switch, ActivityIndicator } from 'react-native-paper';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { StandardHeader } from '../components/common/StandardHeader';
import { ScreenSafeArea } from '../components/common';
import { useAppDispatch, useAppSelector } from '../hooks/reduxHooks';
import { toggleSpecializedMode } from '../store/settingsSlice';
import { signOutAsync } from '../store/authSlice';
import { useAdaptiveUI } from '../hooks/useAdaptiveUI';
import { DigitalIDCard } from '../components';
import { Text } from '../components/common/Text';
import { theme as appTheme } from '../theme';

export const SettingsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<NavigationProp<Record<string, unknown>>>();
  const dispatch = useAppDispatch();
  const { scaleFactor, isPWDMode } = useAdaptiveUI();
  const settings = useAppSelector((state) => state.settings);
  const authToken = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user);
  const authStatus = useAppSelector((state) => state.auth.status);
  const authError = useAppSelector((state) => state.auth.error);
  const isSignedIn = Boolean(authToken);
  const isSigningOut = isSignedIn && authStatus === 'loading';
  const signedInDescription = 'Token cached locally and will be reused for sync once the backend is active.';
  const signedOutDescription = 'Sign in once /auth/login is configured to unlock clinical history sync.';
  const accountStatusDescription = isSignedIn ? signedInDescription : signedOutDescription;
  const signInDescription = 'Requires the /auth/login backend (see Sign In screen).';
  const signUpDescription = 'Requires the /auth/signup backend (see Create Account screen).';
  const signedInLabel = authUser
    ? `${authUser.firstName || ''} ${authUser.lastName || ''}`.trim() || 'Signed in'
    : 'Signed in';
  const signedInSecondary = authUser
    ? [authUser.phoneNumber, formatDobForDisplay(authUser.dateOfBirth)]
        .filter(Boolean)
        .join(' • ')
    : accountStatusDescription;
  const handleSignOut = useCallback(() => {
    if (!isSignedIn || isSigningOut) {
      return;
    }
    dispatch(signOutAsync());
  }, [dispatch, isSignedIn, isSigningOut]);
  const themeSpacing = (theme as typeof appTheme).spacing ?? appTheme.spacing;
  const scrollBottomPadding = themeSpacing.lg * 2;
  const specializedModes = settings?.specializedModes || {
    isSenior: false,
    isPWD: false,
    isChronic: false,
  };

  const scaledSubheaderStyle = [
    styles.subheader,
    { fontSize: styles.subheader.fontSize * scaleFactor },
  ];

  const scaledItemTitleStyle = [
    styles.itemTitle,
    { fontSize: styles.itemTitle.fontSize * scaleFactor },
  ];
  const scaledDescriptionStyle = {
    fontSize: 14 * scaleFactor,
  };
  return (
    <ScreenSafeArea
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right', 'bottom']}
      disableBottomInset
    >
      <StandardHeader title="Settings" showBackButton={false} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: scrollBottomPadding },
        ]}
      >
        <DigitalIDCard />
        <View style={styles.sectionWrapper}>
          <List.Section>
            <List.Subheader style={scaledSubheaderStyle}>Account</List.Subheader>
            <Surface style={[styles.surface, styles.sectionSurfaceSpacing]} elevation={1}>
              {isSignedIn ? (
                <>
                  <List.Item
                    title={signedInLabel}
                    description={signedInSecondary}
                    left={(props) => (
                      <List.Icon {...props} icon="account-check-outline" color={theme.colors.primary} />
                    )}
                    titleStyle={scaledItemTitleStyle}
                    descriptionStyle={scaledDescriptionStyle}
                  />
                  <Divider />
                  <List.Item
                    title="Sign Out"
                    description="Clear the cached token and return to a signed-out state."
                    left={(props) => (
                      <List.Icon {...props} icon="logout" color={theme.colors.primary} />
                    )}
                    right={(props) =>
                      isSigningOut ? (
                        <ActivityIndicator animating size={20} color={theme.colors.primary} />
                      ) : (
                        <List.Icon {...props} icon="chevron-right" />
                      )
                    }
                    onPress={handleSignOut}
                    disabled={isSigningOut}
                    titleStyle={scaledItemTitleStyle}
                    descriptionStyle={scaledDescriptionStyle}
                  />
                </>
              ) : (
                <>
                  <List.Item
                    title="Sign In"
                    description={signInDescription}
                    left={(props) => (
                      <List.Icon {...props} icon="login" color={theme.colors.primary} />
                    )}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => navigation.navigate('SignIn')}
                    titleStyle={scaledItemTitleStyle}
                    descriptionStyle={scaledDescriptionStyle}
                  />
                  <Divider />
                  <List.Item
                    title="Create Account"
                    description={signUpDescription}
                    left={(props) => (
                      <List.Icon {...props} icon="account-plus-outline" color={theme.colors.primary} />
                    )}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => navigation.navigate('SignUp')}
                    titleStyle={scaledItemTitleStyle}
                    descriptionStyle={scaledDescriptionStyle}
                  />
                </>
              )}
            </Surface>
            {authError && (
              <Text style={[styles.authError, { color: theme.colors.error }]}>{authError}</Text>
            )}
          </List.Section>
        </View>
        <View style={styles.sectionWrapper}>
          <List.Section>
            <List.Subheader style={scaledSubheaderStyle}>My Account</List.Subheader>
            <Surface style={[styles.surface, styles.sectionSurfaceSpacing]} elevation={1}>
              <List.Item
                title="Edit Health Profile"
                description="Update your personal health information"
                left={(props) => (
                  <List.Icon {...props} icon="account-edit-outline" color={theme.colors.primary} />
                )}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('HealthProfileEdit')}
                titleStyle={scaledItemTitleStyle}
                descriptionStyle={scaledDescriptionStyle}
              />
              <Divider />
              <List.Item
                title="Health Records"
                description="View your past assessment data"
                left={(props) => (
                  <List.Icon {...props} icon="folder-multiple-outline" color={theme.colors.primary} />
                )}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('ClinicalHistory')}
                titleStyle={scaledItemTitleStyle}
                descriptionStyle={scaledDescriptionStyle}
              />
            </Surface>
          </List.Section>
        </View>

        <View style={styles.sectionWrapper}>
          <List.Section>
            <List.Subheader style={scaledSubheaderStyle}>Care Profile</List.Subheader>
            <CareProfileCard
              key={isPWDMode ? 'care-profile-pwd-on' : 'care-profile-pwd-off'}
              isPWDMode={isPWDMode}
              specializedModes={specializedModes}
              onToggleMode={(mode) => dispatch(toggleSpecializedMode(mode))}
              primaryColor={theme.colors.primary}
              itemTitleStyle={scaledItemTitleStyle}
              descriptionStyle={scaledDescriptionStyle}
              containerStyle={styles.sectionSurfaceSpacing}
            />
          </List.Section>
        </View>

        <View style={styles.sectionWrapper}>
          <List.Section>
            <List.Subheader style={scaledSubheaderStyle}>Care Tools</List.Subheader>
            <Surface style={[styles.surface, styles.sectionSurfaceSpacing]} elevation={1}>
              <List.Item
                title="Medication Tracker"
                description="Log doses, track adherence, and set reminders"
                left={(props) => <List.Icon {...props} icon="pill" color={theme.colors.primary} />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('MedicationTracker')}
                titleStyle={scaledItemTitleStyle}
                descriptionStyle={scaledDescriptionStyle}
              />
            </Surface>
          </List.Section>
        </View>

        <View style={styles.sectionWrapper}>
          <List.Section>
            <List.Subheader style={scaledSubheaderStyle}>About</List.Subheader>
            <Surface style={[styles.surface, styles.sectionSurfaceSpacing]} elevation={1}>
              <List.Item
                title="Privacy Policy"
                left={(props) => <List.Icon {...props} icon="shield-account-outline" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('PrivacyPolicy')}
                titleStyle={scaledItemTitleStyle}
                descriptionStyle={scaledDescriptionStyle}
              />
              <Divider />
              <List.Item
                title="Terms of Service"
                left={(props) => <List.Icon {...props} icon="file-document-outline" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate('TermsOfService')}
                titleStyle={scaledItemTitleStyle}
                descriptionStyle={scaledDescriptionStyle}
              />
            </Surface>
          </List.Section>
        </View>
      </ScrollView>
    </ScreenSafeArea>
  );
};

type SpecializedModeKey = 'isSenior' | 'isPWD' | 'isChronic';

type CareProfileCardProps = {
  isPWDMode: boolean;
  specializedModes: {
    isSenior: boolean;
    isPWD: boolean;
    isChronic: boolean;
  };
  onToggleMode: (mode: SpecializedModeKey) => void;
  primaryColor: string;
  itemTitleStyle: StyleProp<TextStyle>;
  descriptionStyle: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

const CareProfileCard = React.memo<CareProfileCardProps>(
  ({ isPWDMode, specializedModes, onToggleMode, primaryColor, itemTitleStyle, descriptionStyle, containerStyle }) => {
    const surfaceStyle = useMemo(
      () => (isPWDMode ? [styles.surface, styles.pwdSurfaceHighlight] : styles.surface),
      [isPWDMode],
    );

    const titleStyle = useMemo(
      () => (isPWDMode ? [itemTitleStyle, styles.pwdTitleActive] : itemTitleStyle),
      [isPWDMode, itemTitleStyle],
    );

    const toggleSenior = useCallback(() => onToggleMode('isSenior'), [onToggleMode]);
    const togglePWD = useCallback(() => onToggleMode('isPWD'), [onToggleMode]);

    const pwdDescription = useMemo(
      () =>
        isPWDMode
          ? 'Simplified layout active â€” larger text, spacing, and touch targets across the app.'
          : 'Optimize for accessibility needs',
      [isPWDMode],
    );

    return (
      <Surface style={[surfaceStyle, containerStyle]} elevation={1}>
        <List.Item
          title="Senior"
          description="Optimize for elderly care needs"
          left={(props) => (
            <List.Icon {...props} icon="account-star-outline" color={primaryColor} />
          )}
          right={() => (
            <View style={styles.switchContainer}>
              <Switch value={specializedModes.isSenior} onValueChange={toggleSenior} color={primaryColor} />
            </View>
          )}
          titleStyle={itemTitleStyle}
          descriptionStyle={descriptionStyle}
        />
        <Divider />
        <List.Item
          title="PWD"
          description={pwdDescription}
          left={(props) => <List.Icon {...props} icon="wheelchair" color={primaryColor} />}
          right={() => (
            <View style={styles.switchContainer}>
              <Switch value={specializedModes.isPWD} onValueChange={togglePWD} color={primaryColor} />
            </View>
          )}
          titleStyle={titleStyle}
          descriptionStyle={descriptionStyle}
        />
      </Surface>
    );
  },
);

CareProfileCard.displayName = 'CareProfileCard';

const formatDobForDisplay = (dob?: string | null): string | null => {
  if (!dob) {
    return null;
  }
  const parts = dob.split('-');
  if (parts.length !== 3) {
    return dob;
  }
  const [year, month, day] = parts;
  if (!month || !day || !year) {
    return dob;
  }
  return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${year}`;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingTop: 8,
  },
  surface: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'white',
  },
  sectionWrapper: {
    width: '100%',
    marginTop: 16,
  },
  sectionSurfaceSpacing: {
    marginTop: 8,
  },
  subheader: {
    paddingLeft: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  itemTitle: {
    fontSize: 16,
  },
  switchContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: 8,
  },
  pwdSurfaceHighlight: {
    borderWidth: 1,
    borderColor: '#7C3AED',
    backgroundColor: '#FFFCF9',
  },
  pwdTitleActive: {
    color: '#141B2F',
  },
  authError: {
    marginTop: 8,
    paddingHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
  },
});
