import { ArrowLeft, Calendar, ChevronDown, ChevronRight, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import WebView from 'react-native-webview';
import { CustomInput } from '../components/CustomInput';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { TabSwitcher } from '../components/TabSwitcher';
import { userService } from '../services/userService';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

import { useNavigation } from '@react-navigation/native';
import { CustomAlert } from '../components/CustomAlert';

const GENDER_OPTIONS = ['Male', 'Female', 'Other'];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getDaysInMonth(month: number, year: number) {
    return new Date(year, month + 1, 0).getDate();
}

function formatDate(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const m = MONTHS[date.getMonth()];
    const y = date.getFullYear();
    return `${d} ${m} ${y}`;
}

function toISODate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export const SettingsScreen = () => {
    const navigation = useNavigation();
    const [activeTab, setActiveTab] = useState('Profile');
    const { logout, user, setUser } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);

    // Form State
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [dob, setDob] = useState("");
    const [gender, setGender] = useState("");

    const [dobDate, setDobDate] = useState<Date | null>(null);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showGenderPicker, setShowGenderPicker] = useState(false);

    // Temp date picker state
    const [tempDay, setTempDay] = useState(1);
    const [tempMonth, setTempMonth] = useState(0);
    const [tempYear, setTempYear] = useState(2000);

    const [currentPassword, setCurrentPassword] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Legal Modal State
    const [legalModalUrl, setLegalModalUrl] = useState<string | null>(null);
    const [legalModalTitle, setLegalModalTitle] = useState('');

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

    const showAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
        setAlertConfig({ visible: true, title, message, type });
    };

    const hideAlert = () => {
        setAlertConfig(prev => ({ ...prev, visible: false }));
    };

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        setIsLoading(true);
        try {
            const response = await userService.getProfile();
            console.log("🚀 ~ fetchProfile ~ response:", response)
            const userData =
                response?.data?.user ||
                response?.user ||
                response?.data ||
                response;

            if (userData && typeof userData === 'object' && userData.id) {
                const current = useAuthStore.getState().user;
                setUser({ ...(current || {}), ...userData });
                setFirstName(userData.first_name || "");
                setLastName(userData.last_name || "");
                setEmail(userData.email || "");
                setPhone(userData.contact || "");
                if (userData.date_of_birth) {
                    // Ensure we parse "YYYY-MM-DD" strictly in local time to avoid timezone offset shifts
                    const dateStr = userData.date_of_birth.split('T')[0];
                    if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                        const [y, m, d] = dateStr.split('-');
                        const localDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
                        setDobDate(localDate);
                        setDob(formatDate(localDate));
                    } else {
                        const d = new Date(userData.date_of_birth);
                        setDobDate(d);
                        setDob(formatDate(d));
                    }
                }
                setGender(userData.gender || "");
            } else {
                console.warn("fetchProfile: unexpected profile response shape", response);
                showAlert("Error", "Failed to load profile data", 'error');
            }
        } catch (error) {
            console.error("Failed to fetch profile", error);
            showAlert("Error", "Failed to load profile data", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        // Navigation reset is handled by RootNavigator now
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            'Delete Account',
            'Deleting your account will permanently remove your profile and associated data, including your health records and reports from the app. Some data may be retained where required by applicable law.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoading(true);
                        try {
                            await userService.deleteAccount(user?.id);
                            logout();
                        } catch (error: any) {
                            console.error('Delete account failed', error);
                            showAlert('Error', error.response?.data?.message || 'Failed to delete account', 'error');
                        } finally {
                            setIsLoading(false);
                        }
                    },
                },
            ],
        );
    };

    return (
        <ScreenWrapper style={{ flex: 1, backgroundColor: colors['background'] }} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={{ paddingHorizontal: 24, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <ArrowLeft size={24} color="#000" />
                </TouchableOpacity>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: colors['text-primary'], marginRight: 24 }}>Account Settings</Text>
            </View>

            {/* Main Content Card (White with Top Radius) */}
            <View style={{
                flex: 1,
                backgroundColor: 'white',
                borderTopLeftRadius: 40,
                borderTopRightRadius: 40,
                paddingHorizontal: 24,
                paddingTop: 32,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.1,
                shadowRadius: 2,
                elevation: 2
            }}>
                <TabSwitcher 
                    tabs={['Profile', 'Change Password']}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                />

                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                        
                        {activeTab === 'Profile' ? (
                            <>
                                <CustomInput label="First Name" value={firstName} onChangeText={setFirstName} />
                                {/* Middle Name omitted if not in API usually, can ask user */}
                                <CustomInput label="Last Name" value={lastName} onChangeText={setLastName} />
                                <CustomInput label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
                                
                                <View style={{ marginBottom: 16 }}>
                                     <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={{ color: colors['text-primary'], fontWeight: '500', fontSize: 16 }}>Phone No.</Text>
                                     </View>
                                     <View style={{ flexDirection: 'row', gap: 12 }}>
                                         <View style={{ flex: 1, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, height: 56, justifyContent: 'center', paddingHorizontal: 16 }}>
                                             <Text style={{ color: '#A0A0A0', fontSize: 16, fontWeight: '500' }}>{phone}</Text>
                                         </View>
                                     </View>
                                </View>

                                {/* Date of Birth */}
                                <View style={{ marginBottom: 16 }}>
                                    <Text style={{ color: colors['text-primary'], fontWeight: '500', marginBottom: 8, fontSize: 16 }}>Date of Birth</Text>
                                    <TouchableOpacity
                                        onPress={() => {
                                            const d = dobDate ?? new Date(2000, 0, 1);
                                            setTempDay(d.getDate());
                                            setTempMonth(d.getMonth());
                                            setTempYear(d.getFullYear());
                                            setShowDatePicker(true);
                                        }}
                                        activeOpacity={0.7}
                                        style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 12, height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                    >
                                        <Text style={{ color: dob ? colors['text-primary'] : '#A0A0A0', fontSize: 16, fontWeight: '500' }}>{dob || 'Select date'}</Text>
                                        <Calendar size={20} color={colors['text-primary']} />
                                    </TouchableOpacity>
                                </View>

                                {/* Gender */}
                                <View style={{ marginBottom: 16 }}>
                                    <Text style={{ color: colors['text-primary'], fontWeight: '500', marginBottom: 8, fontSize: 16 }}>Gender</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowGenderPicker(true)}
                                        activeOpacity={0.7}
                                        style={{ backgroundColor: 'white', borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 12, height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                    >
                                        <Text style={{ color: gender ? colors['text-primary'] : '#A0A0A0', fontSize: 16, fontWeight: '500', textTransform: 'capitalize' }}>{gender || 'Select gender'}</Text>
                                        <ChevronDown size={20} color={colors['text-secondary']} />
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                             <>
                                {user?.password_created && (
                                    <CustomInput label="Current Password" placeholder="Current Password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
                                )}
                                <CustomInput label="New Password" placeholder="New Password" value={password} onChangeText={setPassword} secureTextEntry />
                                <CustomInput label="Confirm Password" placeholder="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
                             </>
                        )}

                        <TouchableOpacity 
                            style={{
                                backgroundColor: colors.primary,
                                height: 56,
                                borderRadius: 12,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginTop: 24,
                                marginBottom: 40,
                                opacity: isLoading ? 0.7 : 1,
                                shadowColor: '#000',
                                shadowOffset: { width: 0, height: 1 },
                                shadowOpacity: 0.1,
                                shadowRadius: 2,
                                elevation: 2
                            }}
                            onPress={async () => {
                                if (isLoading) return;
                                setIsLoading(true);
                                try {
                                    if (activeTab === 'Profile') {
                                        await userService.updateProfile(user?.id, {
                                            first_name: firstName,
                                            last_name: lastName,
                                            email: email,
                                            ...(dobDate ? { date_of_birth: toISODate(dobDate) } : {}),
                                            ...(gender ? { gender: gender.toLowerCase() } : {}),
                                        });
                                        showAlert("Success", "Profile updated successfully", 'success');
                                        await fetchProfile(); // Refresh
                                    } else {
                                        if (!password || !confirmPassword) {
                                            showAlert("Error", "Please fill all fields", 'error');
                                            setIsLoading(false);
                                            return;
                                        }
                                        if (password !== confirmPassword) {
                                            showAlert("Error", "Passwords do not match", 'error');
                                            setIsLoading(false);
                                            return;
                                        }
                                        if (user?.password_created) {
                                            if (!currentPassword) {
                                                showAlert("Error", "Please enter your current password", 'error');
                                                setIsLoading(false);
                                                return;
                                            }
                                            await userService.resetPassword(currentPassword, password, confirmPassword);
                                        } else {
                                            await userService.createPassword(password, confirmPassword);
                                        }
                                        showAlert("Success", "Password updated successfully", 'success');
                                        setCurrentPassword("");
                                        setPassword("");
                                        setConfirmPassword("");
                                    }
                                } catch (error: any) {
                                    console.error("Update failed", error);
                                    showAlert("Error", error.response?.data?.message || "Failed to update settings", 'error');
                                } finally {
                                    setIsLoading(false);
                                }
                            }}
                            disabled={isLoading}
                        >
                            <Text style={{ color: 'white', fontWeight: '600', fontSize: 18 }}>
                                {isLoading ? "Saving..." : (activeTab === 'Change Password' ? 'Update Password' : 'Save Changes')}
                            </Text>
                        </TouchableOpacity>
                        
                        {/* Legal Links */}
                        <View style={{ marginTop: 24, gap: 12 }}>
                            <TouchableOpacity
                                onPress={() => { setLegalModalTitle('Privacy Policy'); setLegalModalUrl('https://flahyhealth.com/privacy-policy-mobile'); }}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F3F4F6' }}
                            >
                                <Text style={{ fontSize: 15, fontWeight: '500', color: colors['text-primary'] }}>Privacy Policy</Text>
                                <ChevronRight size={18} color={colors['text-secondary']} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => { setLegalModalTitle('Terms & Conditions'); setLegalModalUrl('https://flahyhealth.com/terms-condition'); }}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F3F4F6' }}
                            >
                                <Text style={{ fontSize: 15, fontWeight: '500', color: colors['text-primary'] }}>Terms & Conditions</Text>
                                <ChevronRight size={18} color={colors['text-secondary']} />
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                            onPress={handleLogout}
                            style={{ marginTop: 16, backgroundColor: '#FEF2F2', padding: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FEE2E2' }}
                        >
                            <Text style={{ color: '#EF4444', fontWeight: 'bold', fontSize: 16 }}>Log Out</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={handleDeleteAccount}
                            disabled={isLoading}
                            style={{ marginTop: 12, backgroundColor: '#FEF2F2', padding: 16, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5', marginBottom: 80, opacity: isLoading ? 0.7 : 1 }}
                        >
                            <Text style={{ color: '#DC2626', fontWeight: 'bold', fontSize: 16 }}>Delete Account</Text>
                        </TouchableOpacity>

                    </ScrollView>
                </KeyboardAvoidingView>
            </View>

            {/* Gender Picker Modal */}
            <Modal visible={showGenderPicker} transparent animationType="slide">
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setShowGenderPicker(false)}>
                    <Pressable style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                            <Text style={{ fontSize: 18, fontWeight: '600', color: colors['text-primary'] }}>Select Gender</Text>
                            <TouchableOpacity onPress={() => setShowGenderPicker(false)}>
                                <Text style={{ fontSize: 16, color: colors['text-secondary'] }}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                        {GENDER_OPTIONS.map(option => (
                            <TouchableOpacity
                                key={option}
                                onPress={() => {
                                    setGender(option.toLowerCase());
                                    setShowGenderPicker(false);
                                }}
                                style={{
                                    paddingHorizontal: 24,
                                    paddingVertical: 16,
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#F3F4F6',
                                    backgroundColor: gender === option.toLowerCase() ? colors['green-light'] : 'white',
                                }}
                            >
                                <Text style={{
                                    fontSize: 16,
                                    fontWeight: gender === option.toLowerCase() ? '600' : '400',
                                    color: gender === option.toLowerCase() ? colors.primary : colors['text-primary'],
                                }}>{option}</Text>
                            </TouchableOpacity>
                        ))}
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Date Picker Modal */}
            <Modal visible={showDatePicker} transparent animationType="slide">
                <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setShowDatePicker(false)}>
                    <Pressable style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40 }}>
                        {/* Header */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                            <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                                <Text style={{ fontSize: 16, color: colors['text-secondary'] }}>Cancel</Text>
                            </TouchableOpacity>
                            <Text style={{ fontSize: 18, fontWeight: '600', color: colors['text-primary'] }}>Date of Birth</Text>
                            <TouchableOpacity onPress={() => {
                                const maxDay = getDaysInMonth(tempMonth, tempYear);
                                const clampedDay = Math.min(tempDay, maxDay);
                                const selected = new Date(tempYear, tempMonth, clampedDay);
                                setDobDate(selected);
                                setDob(formatDate(selected));
                                setShowDatePicker(false);
                            }}>
                                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.primary }}>Done</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Picker Columns */}
                        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8 }}>
                            {/* Day */}
                            <View style={{ flex: 1 }}>
                                <Text style={{ textAlign: 'center', fontSize: 13, color: colors['text-secondary'], marginBottom: 8, fontWeight: '500' }}>Day</Text>
                                <ScrollView style={{ height: 180 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 70 }}>
                                    {Array.from({ length: getDaysInMonth(tempMonth, tempYear) }, (_, i) => i + 1).map(d => (
                                        <TouchableOpacity
                                            key={d}
                                            onPress={() => setTempDay(d)}
                                            style={{ paddingVertical: 10, alignItems: 'center', backgroundColor: tempDay === d ? colors['green-light'] : 'transparent', borderRadius: 8, marginHorizontal: 4 }}
                                        >
                                            <Text style={{ fontSize: 18, fontWeight: tempDay === d ? '700' : '400', color: tempDay === d ? colors.primary : colors['text-primary'] }}>{d}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* Month */}
                            <View style={{ flex: 1.2 }}>
                                <Text style={{ textAlign: 'center', fontSize: 13, color: colors['text-secondary'], marginBottom: 8, fontWeight: '500' }}>Month</Text>
                                <ScrollView style={{ height: 180 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 70 }}>
                                    {MONTHS.map((m, i) => (
                                        <TouchableOpacity
                                            key={m}
                                            onPress={() => setTempMonth(i)}
                                            style={{ paddingVertical: 10, alignItems: 'center', backgroundColor: tempMonth === i ? colors['green-light'] : 'transparent', borderRadius: 8, marginHorizontal: 4 }}
                                        >
                                            <Text style={{ fontSize: 18, fontWeight: tempMonth === i ? '700' : '400', color: tempMonth === i ? colors.primary : colors['text-primary'] }}>{m}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            {/* Year */}
                            <View style={{ flex: 1 }}>
                                <Text style={{ textAlign: 'center', fontSize: 13, color: colors['text-secondary'], marginBottom: 8, fontWeight: '500' }}>Year</Text>
                                <ScrollView style={{ height: 180 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 70 }}>
                                    {Array.from({ length: 100 }, (_, i) => new Date().getFullYear() - i).map(y => (
                                        <TouchableOpacity
                                            key={y}
                                            onPress={() => setTempYear(y)}
                                            style={{ paddingVertical: 10, alignItems: 'center', backgroundColor: tempYear === y ? colors['green-light'] : 'transparent', borderRadius: 8, marginHorizontal: 4 }}
                                        >
                                            <Text style={{ fontSize: 18, fontWeight: tempYear === y ? '700' : '400', color: tempYear === y ? colors.primary : colors['text-primary'] }}>{y}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        </View>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Legal Document Modal */}
            <Modal visible={!!legalModalUrl} animationType="slide" presentationStyle="pageSheet">
                <View style={{ flex: 1, backgroundColor: 'white', paddingTop: Platform.OS === 'ios' ? 56 : 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                        <Text style={{ fontSize: 17, fontWeight: '600', color: colors['text-primary'] }}>{legalModalTitle}</Text>
                        <TouchableOpacity onPress={() => setLegalModalUrl(null)} style={{ padding: 4 }}>
                            <X size={24} color={colors['text-secondary']} />
                        </TouchableOpacity>
                    </View>
                    {legalModalUrl && (
                        <WebView
                            source={{ uri: legalModalUrl }}
                            style={{ flex: 1 }}
                            startInLoadingState
                            renderLoading={() => (
                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                                    <ActivityIndicator size="large" color={colors.primary} />
                                </View>
                            )}
                        />
                    )}
                </View>
            </Modal>

            <CustomAlert
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                type={alertConfig.type}
                onClose={hideAlert}
            />
        </ScreenWrapper>
    );
};
