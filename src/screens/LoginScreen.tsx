import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { CustomAlert } from '../components/CustomAlert';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { SignupForm } from '../components/SignupForm';
import { RootStackParamList } from '../navigation/types';
import { authService } from '../services/authService';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

const BG_IMAGE = require('../assets/login_bg.jpg');

import { RouteProp, useRoute } from '@react-navigation/native';
// ...
const KeyboardWrapper = ({ children }: { children: React.ReactNode }) => {
  return Platform.OS === 'ios' ? (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {children}
    </KeyboardAvoidingView>
  ) : (
    <KeyboardAwareScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      enableOnAndroid={true}
      extraScrollHeight={20}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </KeyboardAwareScrollView>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 32px horizontal padding on each side (px-8), so available width = SCREEN_WIDTH - 64
// 6 boxes + 5 gaps between them
const OTP_H_PADDING = 64; // 32px * 2
const OTP_GAP = 8;
const OTP_BOX_SIZE = Math.floor(
  (SCREEN_WIDTH - OTP_H_PADDING - OTP_GAP * 5) / 6,
);

export const LoginScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>(); // Get route params

  // Modes: 'welcome' (initial), 'login' (phone flow), 'signup' (form)
  const [mode, setMode] = useState<'welcome' | 'login' | 'signup'>(
    route.params?.initialMode || 'welcome',
  );

  // Login State
  const [loginStep, setLoginStep] = useState<'input' | 'otp'>('input');
  // Phone OTP login is intentionally disabled — email is the only login method.
  // Phone state/UI/handlers are kept commented out below for easy re-enable.
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [activeInput, setActiveInput] = useState<'phone' | 'email' | null>(
    'email',
  );
  const [otp, setOtp] = useState('');
  const [timer, setTimer] = useState(30);
  const [isLoading, setIsLoading] = useState(false);

  const setToken = useAuthStore(state => state.setToken);
  const setUser = useAuthStore(state => state.setUser);
  const otpInputRef = useRef<TextInput>(null);

  // Auto-focus OTP input when entering OTP step (without using autoFocus prop)
  // This avoids the Android bug where autoFocus kills keyboard re-open
  useEffect(() => {
    if (loginStep === 'otp') {
      const t = setTimeout(() => otpInputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [loginStep]);

  // Timer logic
  useEffect(() => {
    let interval: any;
    if (loginStep === 'otp' && timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000);
    }
    return () => clearInterval(interval);
  }, [loginStep, timer]);

  // Custom Alert State
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });

  const showAlert = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
  ) => {
    setAlertConfig({ visible: true, title, message, type });
  };

  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  const handleContinueLogin = async (otpOverride?: string) => {
    if (isLoading) return;
    // Email-only login flow. Phone OTP is intentionally disabled.
    if (loginStep === 'input') {
      if (!email) {
        showAlert('Error', 'Please enter an email address', 'error');
        return;
      }

      setIsLoading(true);
      try {
        await authService.sendOtp(email, '', 1);
        setLoginStep('otp');
        setTimer(30);
      } catch (error: any) {
        showAlert(
          'Error',
          error.response?.data?.message || 'Failed to send OTP',
          'error',
        );
      } finally {
        setIsLoading(false);
      }

      /* Phone OTP path (disabled — email is the only login method)
            let method = activeInput;
            if (!method) {
                if (phoneNumber && !email) method = 'phone';
                else if (email && !phoneNumber) method = 'email';
                else if (phoneNumber && email) method = 'phone';
                else {
                    showAlert("Error", "Please enter a phone number or email address", 'error');
                    return;
                }
            } else {
                if (method === 'phone' && !phoneNumber) { showAlert("Error", "Please enter a phone number", 'error'); return; }
                if (method === 'email' && !email) { showAlert("Error", "Please enter an email address", 'error'); return; }
            }
            if (method === 'phone') {
                await authService.sendOtp(phoneNumber, '+91', 2);
            } else {
                await authService.sendOtp(email, '', 1);
            }
            */
    } else {
      const otpValue = otpOverride ?? otp;
      if (!otpValue) {
        showAlert('Error', 'Please enter OTP', 'error');
        return;
      }

      setIsLoading(true);
      try {
        const response = await authService.verifyOtp(email, otpValue, 1, '');

        if (response.token) {
          setUser(response.user);
          setToken(response.token);
        } else {
          showAlert('Error', 'Invalid response', 'error');
        }
      } catch (error: any) {
        showAlert(
          'Error',
          error.response?.data?.message || 'Invalid OTP',
          'error',
        );
      } finally {
        setIsLoading(false);
      }

      /* Phone OTP verify path (disabled)
            let method = activeInput;
            if (!method) {
                 if (phoneNumber && !email) method = 'phone';
                 else if (email && !phoneNumber) method = 'email';
                 else method = 'phone';
            }
            const contact = method === 'phone' ? phoneNumber : email;
            const response = await authService.verifyOtp(contact, otpValue, method === 'phone' ? 2 : 1, method === 'phone' ? '+91' : '');
            */
    }
  };

  const handleSignupSubmit = async (data: any) => {
    setIsLoading(true);
    try {
      // Normalize Data
      const payload: any = {
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: data.email.trim().toLowerCase(),
        contact: data.phone.trim(),
        country_code: data.countryCode,
        user_type: 'user',
        consent: data.termsAccepted,
        ...(data.dob ? { date_of_birth: data.dob } : {}),
        ...(data.gender ? { gender: data.gender.toLowerCase() } : {}),
      };

      // Validate Required Fields
      if (!payload.contact) {
        showAlert('Validation Error', 'Phone number is required.', 'error');
        setIsLoading(false);
        return;
      }

      // Only add middle_name if present
      if (data.middleName && data.middleName.trim().length > 0) {
        payload.middle_name = data.middleName.trim();
      }

      console.log('Signup Payload:', JSON.stringify(payload, null, 2));

      const response = await authService.registerUser(payload);
      console.log('Signup Response:', response);

      if (
        response?.status === 200 ||
        response?.status === 201 ||
        response?.success ||
        response?.token
      ) {
        // If API returns a token, log user in directly and go to Dashboard
        if (response?.token) {
          setUser(response.user);
          setToken(response.token);
        } else {
          // No token returned — ask user to log in
          showAlert('Success', 'Account created! Please log in.', 'success');
          setMode('login');
        }
      } else {
        showAlert(
          'Registration Failed',
          response?.message || 'Please check your details.',
          'error',
        );
      }
    } catch (error: any) {
      console.error(
        'Signup Error Full:',
        JSON.stringify(error.response?.data, null, 2),
      );

      // Enhanced Error Handling for 422
      const serverMessage = error.response?.data?.message;
      const validationErrors = error.response?.data?.errors;

      const fieldLabels: Record<string, string> = {
        first_name: 'First Name',
        middle_name: 'Middle Name',
        last_name: 'Last Name',
        email: 'Email',
        contact: 'Phone Number',
        country_code: 'Country Code',
        date_of_birth: 'Date of Birth',
        gender: 'Gender',
        consent: 'Terms & Conditions',
        user_type: 'User Type',
      };

      const formatFieldMessage = (msg: string) => {
        return Object.entries(fieldLabels).reduce(
          (result, [key, label]) => result.replace(new RegExp(key, 'g'), label),
          msg,
        );
      };

      let displayMessage = 'An error occurred during signup.';

      if (Array.isArray(validationErrors)) {
        displayMessage = validationErrors
          .map((e: any) => formatFieldMessage(e.message))
          .filter(Boolean)
          .join('\n');
      } else if (validationErrors && typeof validationErrors === 'object') {
        displayMessage = Object.values(validationErrors)
          .flat()
          .map((msg: any) => formatFieldMessage(String(msg)))
          .join('\n');
      } else if (serverMessage) {
        displayMessage =
          typeof serverMessage === 'string'
            ? formatFieldMessage(serverMessage)
            : JSON.stringify(serverMessage);
      } else {
        displayMessage = error.message || 'Unknown error';
      }

      showAlert('Error', displayMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    if (mode === 'login') {
      if (loginStep === 'otp') {
        setLoginStep('input');
        setOtp('');
      } else {
        setMode('welcome');
      }
    } else if (mode === 'signup') {
      setMode('welcome');
    }
  };

  // Resend Logic — email-only.
  const handleResend = async () => {
    if (timer > 0) return;
    setIsLoading(true);
    try {
      await authService.sendOtp(email, '', 1);
      setTimer(30);
      showAlert('Success', 'OTP resent successfully', 'success');
    } catch (error: any) {
      showAlert(
        'Error',
        error.response?.data?.message || 'Failed to resend OTP',
        'error',
      );
    } finally {
      setIsLoading(false);
    }

    /* Phone OTP resend path (disabled)
        let method = activeInput || (phoneNumber ? 'phone' : 'email');
        if (method === 'phone') await authService.sendOtp(phoneNumber, '+91', 2);
        else await authService.sendOtp(email, '', 1);
        */
  };

  if (mode === 'signup') {
    return (
      <ScreenWrapper>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-[#FFFFF0]"
        >
          <View className="flex-1 px-4">
            <View className="flex-row items-center mt-2 mb-2 ml-1">
              <TouchableOpacity onPress={handleBack} className="p-2 mr-2 -ml-2">
                <ArrowLeft size={24} color={colors['text-primary']} />
              </TouchableOpacity>
              <Text className="text-2xl font-bold text-text-primary">
                Sign Up
              </Text>
            </View>
            <SignupForm onSubmit={handleSignupSubmit} isLoading={isLoading} />
          </View>
          <CustomAlert
            visible={alertConfig.visible}
            title={alertConfig.title}
            message={alertConfig.message}
            type={alertConfig.type}
            onClose={hideAlert}
          />
        </KeyboardAvoidingView>
      </ScreenWrapper>
    );
  }

  return (
    <KeyboardWrapper>
      <View className="flex-1 bg-black">
        {/* Background Image Section - Flex-1 takes remaining space */}
        <View className="relative flex-1 w-full">
          <ImageBackground
            source={BG_IMAGE}
            className="flex-1 justify-start"
            resizeMode="cover"
          />
        </View>

        {/* Bottom Sheet Content - No longer absolute, sits below image */}
        <View className="justify-end w-full bg-black" pointerEvents="box-none">
          <View
            className={`bg-[#FFFFF0] rounded-t-[32px] px-8 pt-10 ${
              mode === 'welcome' ? 'pb-8' : 'pb-12'
            } w-full -mt-8 justify-between`}
          >
            {/* Back Button */}
            {mode !== 'welcome' && (
              <TouchableOpacity
                onPress={handleBack}
                className="absolute top-6 left-6 z-10 p-2"
              >
                <ArrowLeft size={24} color={colors['text-primary']} />
              </TouchableOpacity>
            )}

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              {/* Logo & Header */}
              <View className="items-center mb-8">
                <View className="flex-row gap-4 justify-center items-center mb-6">
                  <Image
                    source={require('../assets/flahy_icon.png')}
                    style={{ width: 60, height: 60 }}
                    resizeMode="contain"
                  />
                  <Text className="mt-2 text-3xl font-bold tracking-widest text-text-primary font-modern">
                    FLAHY
                  </Text>
                </View>

                {mode === 'welcome' && (
                  <>
                    <Text className="text-2xl font-medium text-center text-text-primary">
                      Welcome Back
                    </Text>
                  </>
                )}

                {mode === 'login' && loginStep === 'input' && (
                  <>
                    <Text className="text-2xl font-medium text-center text-text-primary">
                      Welcome Back
                    </Text>
                    <Text className="mt-2 text-base text-text-secondary">
                      Log in to your account
                    </Text>
                  </>
                )}

                {mode === 'login' && loginStep === 'otp' && (
                  <>
                    <Text className="text-2xl font-medium text-center text-text-primary">
                      Verification
                    </Text>
                    <Text className="px-4 mt-2 text-base text-center text-text-secondary">
                      Enter the code sent to your email
                    </Text>
                  </>
                )}
              </View>

              {/* MODE: WELCOME */}
              {mode === 'welcome' && (
                <View className="gap-4">
                  <TouchableOpacity
                    onPress={() => setMode('login')}
                    className="h-14 bg-[#2CAEA6] rounded-xl items-center justify-center active:opacity-90 shadow-sm"
                  >
                    <Text className="text-lg font-semibold text-white">
                      Log in
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setMode('signup')}
                    className="h-14 bg-[#2CAEA6] rounded-xl items-center justify-center active:opacity-90 shadow-sm"
                  >
                    <Text className="text-lg font-semibold text-white">
                      Sign Up
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* MODE: LOGIN */}
              {mode === 'login' &&
                (loginStep === 'input' ? (
                  <View className="gap-6">
                    {/* Phone OTP login is disabled — email is the only login method.
                                            Phone Number input + divider preserved below as a comment for future re-enable. */}
                    {/*
                                        <View>
                                            <Text className="mb-2 font-medium text-text-primary">Phone Number</Text>
                                            <View className={`flex-row border rounded-xl overflow-hidden h-14 bg-white items-center ${activeInput === 'phone' ? 'border-primary' : 'border-gray-300'}`}>
                                                <View className="flex-row gap-1 justify-center items-center px-4 h-full bg-gray-50 border-r border-gray-200">
                                                    <Text className="font-medium text-text-primary">+91</Text>
                                                    <Text className="text-[10px] text-text-secondary">▼</Text>
                                                </View>
                                                <TextInput
                                                    style={{ flex: 1, paddingHorizontal: 16, color: colors['text-primary'], fontSize: 16, padding: 0 }}
                                                    placeholder="123456789"
                                                    placeholderTextColor="#A0A0A0"
                                                    keyboardType="phone-pad"
                                                    returnKeyType="done"
                                                    value={phoneNumber}
                                                    onChangeText={(text) => {
                                                        setPhoneNumber(text);
                                                        if (text) setActiveInput('phone');
                                                    }}
                                                    onFocus={() => {
                                                        setActiveInput('phone');
                                                    }}
                                                />
                                            </View>
                                        </View>

                                        <View className="flex-row gap-4 items-center py-2">
                                            <View className="h-[1px] bg-gray-300 flex-1" />
                                            <Text className="text-text-secondary">Or continue with:</Text>
                                            <View className="h-[1px] bg-gray-300 flex-1" />
                                        </View>
                                        */}

                    {/* Email Input */}
                    <View>
                      <Text className="mb-2 font-medium text-text-primary">
                        Email address
                      </Text>
                      <View
                        className={`border rounded-xl overflow-hidden h-14 bg-white items-center flex-row ${
                          email ? 'border-primary' : 'border-gray-300'
                        }`}
                      >
                        <TextInput
                          style={{
                            flex: 1,
                            paddingHorizontal: 16,
                            color: colors['text-primary'],
                            fontSize: 16,
                            padding: 0,
                          }}
                          placeholder="john.carter@gmail.com"
                          placeholderTextColor="#A0A0A0"
                          keyboardType="email-address"
                          autoCapitalize="none"
                          returnKeyType="done"
                          value={email}
                          onChangeText={text => {
                            setEmail(text);
                            if (text) setActiveInput('email');
                          }}
                          onFocus={() => {
                            setActiveInput('email');
                          }}
                        />
                      </View>
                    </View>
                  </View>
                ) : (
                  /* OTP Input — 6 individual boxes */
                  <View style={{ marginBottom: 32 }}>
                    {/* Hidden TextInput captures keyboard */}
                    <TextInput
                      ref={otpInputRef}
                      value={otp}
                      onChangeText={text => {
                        const cleaned = text.replace(/[^0-9]/g, '');
                        setOtp(cleaned);
                        if (cleaned.length === 6) {
                          handleContinueLogin(cleaned);
                        }
                      }}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={() => handleContinueLogin()}
                      maxLength={6}
                      showSoftInputOnFocus
                      caretHidden
                      style={{
                        position: 'absolute',
                        opacity: 0,
                        height: 0,
                        width: 0,
                      }}
                    />

                    {/* Visual OTP boxes — tap anywhere to re-focus keyboard */}
                    <Pressable
                      onPress={() => {
                        otpInputRef.current?.focus();
                      }}
                      style={otpStyles.boxRow}
                    >
                      {Array.from({ length: 6 }).map((_, i) => {
                        const digit = otp[i] || '';
                        const isFocused = otp.length === i;
                        return (
                          <View
                            key={i}
                            style={[
                              otpStyles.box,
                              isFocused && otpStyles.boxFocused,
                              digit ? otpStyles.boxFilled : null,
                            ]}
                          >
                            <Text
                              style={[
                                otpStyles.digit,
                                !digit && otpStyles.placeholder,
                              ]}
                            >
                              {digit || '0'}
                            </Text>
                          </View>
                        );
                      })}
                    </Pressable>

                    {/* Resend */}
                    <TouchableOpacity
                      onPress={handleResend}
                      disabled={timer > 0 || isLoading}
                      style={{ alignItems: 'center', marginTop: 24 }}
                    >
                      <Text
                        style={{
                          fontWeight: '500',
                          fontSize: 14,
                          color:
                            timer > 0
                              ? colors['text-secondary']
                              : colors.primary,
                        }}
                      >
                        {timer > 0 ? `Resend OTP in ${timer}s` : 'Resend OTP'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}

              {/* Continue Button for Login Mode (Input & OTP) */}
              {mode === 'login' && (
                <TouchableOpacity
                  onPress={() => handleContinueLogin()}
                  disabled={isLoading}
                  className="h-14 bg-[#2CAEA6] rounded-xl items-center justify-center mt-8 active:opacity-90"
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-lg font-semibold text-white">
                      Continue
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </ScrollView>
            <CustomAlert
              visible={alertConfig.visible}
              title={alertConfig.title}
              message={alertConfig.message}
              type={alertConfig.type}
              onClose={hideAlert}
            />
          </View>
        </View>
      </View>
    </KeyboardWrapper>
  );
};

const otpStyles = StyleSheet.create({
  boxRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: OTP_GAP,
  },
  box: {
    width: OTP_BOX_SIZE,
    height: OTP_BOX_SIZE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFocused: {
    borderColor: colors.teal,
    borderWidth: 2,
  },
  boxFilled: {
    borderColor: colors.primary,
    backgroundColor: colors['green-light'],
  },
  digit: {
    fontSize: Math.floor(OTP_BOX_SIZE * 0.45),
    fontWeight: '700',
    color: colors['text-primary'],
  },
  placeholder: {
    color: '#D1D5DB',
    fontWeight: '400',
  },
});
