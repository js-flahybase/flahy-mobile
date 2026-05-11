import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { FileViewerScreen } from '../screens/FileViewerScreen';
import { FlahyAIScreen } from '../screens/FlahyAIScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { SchedulePickupScreen } from '../screens/SchedulePickupScreen';
import * as SettingsScreens from '../screens/SettingsScreen';
import { SupplementScreen } from '../screens/SupplementScreen';
import { UploadScreen } from '../screens/UploadScreen';
import { useAuthStore } from '../store/authStore';
import { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator = () => {
  const token = useAuthStore(state => state.token);
  const user = useAuthStore(state => state.user);
  const hasHydrated = useAuthStore(state => state._hasHydrated);
  const hasOrder = user?.has_order === true;

  // Show a loading screen until the persisted auth state has been restored
  if (!hasHydrated) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#FFFFF0',
        }}
      >
        <ActivityIndicator size="large" color="#2CAEA6" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        <>
          {hasOrder ? (
            <>
              <Stack.Screen name="Dashboard" component={DashboardScreen} />
              <Stack.Screen
                name="ConsentRequired"
                component={SettingsScreens.ConsentRequiredScreen}
                options={{ presentation: 'modal' }}
              />
              <Stack.Screen
                name="Supplements"
                component={SupplementScreen}
                options={{ animation: 'slide_from_right' }}
              />
            </>
          ) : (
            <>
              <Stack.Screen name="Supplements" component={SupplementScreen} />
              <Stack.Screen
                name="Dashboard"
                component={DashboardScreen}
                options={{ animation: 'slide_from_right' }}
              />
              <Stack.Screen
                name="ConsentRequired"
                component={SettingsScreens.ConsentRequiredScreen}
                options={{ presentation: 'modal' }}
              />
            </>
          )}
          <Stack.Screen name="Settings" component={SettingsScreens.SettingsScreen} />
          <Stack.Screen
            name="Upload"
            component={UploadScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="FlahyAI"
            component={FlahyAIScreen}
            options={{ animation: 'slide_from_right' }}
          />
          <Stack.Screen
            name="Reports"
            component={ReportsScreen}
            options={{ presentation: 'modal' }}
          />
          <Stack.Screen
            name="FileViewer"
            component={FileViewerScreen}
            options={{ animation: 'fade' }}
          />
          <Stack.Screen
            name="SchedulePickup"
            component={SchedulePickupScreen}
            options={{ animation: 'slide_from_bottom' }}
          />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
};
