import { Calendar as CalendarIcon, ChevronDown, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DatePicker from 'react-native-date-picker';
import WebView from 'react-native-webview';
import { WEB_APP_URL } from '../config';

interface SignupData {
    firstName: string;
    middleName?: string;
    lastName: string;
    email: string;
    countryCode: string;
    phone: string;
    dob: string;
    gender: string;
    termsAccepted: boolean;
}

interface SignupFormProps {
    onSubmit: (data: SignupData) => void;
    onBack?: () => void;
    isLoading?: boolean;
}

export const SignupForm: React.FC<SignupFormProps> = ({ onSubmit, onBack, isLoading = false }) => {
    const [firstName, setFirstName] = useState('');
    const [middleName, setMiddleName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [countryCode, setCountryCode] = useState('+91');
    const [phone, setPhone] = useState('');
    const [dob, setDob] = useState('');
    const [gender, setGender] = useState('');
    const [termsAccepted, setTermsAccepted] = useState(false);
    
    const [date, setDate] = useState(new Date());
    const [open, setOpen] = useState(false);
    const [showGenderPicker, setShowGenderPicker] = useState(false);
    const [legalModalUrl, setLegalModalUrl] = useState<string | null>(null);
    const [legalModalTitle, setLegalModalTitle] = useState('');

    const handleContinue = () => {
        onSubmit({
            firstName,
            middleName,
            lastName,
            email,
            countryCode,
            phone,
            dob,
            gender,
            termsAccepted
        });
    };

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Header */}
            
            <View className="gap-4">
                {/* First Name */}
                <View>
                    <Text className="text-text-primary font-medium mb-1.5 ml-1">First Name</Text>
                    <TextInput
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder="John"
                        className="bg-white border border-gray-300 rounded-xl px-4 h-12 text-text-primary"
                        placeholderTextColor="#9CA3AF"
                    />
                </View>

                {/* Middle Name */}
                <View>
                    <Text className="text-text-primary font-medium mb-1.5 ml-1">Middle Name (Optional)</Text>
                    <TextInput
                        value={middleName}
                        onChangeText={setMiddleName}
                        placeholder="Enter Middle Name"
                        className="bg-white border border-gray-300 rounded-xl px-4 h-12 text-text-primary"
                        placeholderTextColor="#9CA3AF"
                    />
                </View>

                 {/* Last Name */}
                 <View>
                    <Text className="text-text-primary font-medium mb-1.5 ml-1">Last Name</Text>
                    <TextInput
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder="Carter"
                        className="bg-white border border-gray-300 rounded-xl px-4 h-12 text-text-primary"
                        placeholderTextColor="#9CA3AF"
                    />
                </View>

                {/* Email */}
                <View>
                    <Text className="text-text-primary font-medium mb-1.5 ml-1">Email</Text>
                    <TextInput
                        value={email}
                        onChangeText={setEmail}
                        placeholder="john.carter@gmail.com"
                        keyboardType="email-address"
                        className="bg-white border border-gray-300 rounded-xl px-4 h-12 text-text-primary"
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="none"
                    />
                </View>

                {/* Phone & Country Code */}
                <View className="flex-row gap-3">
                    <View className="w-1/3">
                        <Text className="text-text-primary font-medium mb-1.5 ml-1">Country Code</Text>
                        <View className="bg-white border border-gray-300 rounded-xl px-3 h-12 flex-row items-center justify-between">
                             <Text className="text-text-primary">{countryCode}</Text>
                             <ChevronDown size={16} color="gray" />
                        </View>
                    </View>
                    <View className="flex-1">
                        <Text className="text-text-primary font-medium mb-1.5 ml-1">Phone No.</Text>
                        <TextInput
                            value={phone}
                            onChangeText={setPhone}
                            placeholder="123456789"
                            keyboardType="phone-pad"
                            className="bg-white border border-gray-300 rounded-xl px-4 h-12 text-text-primary"
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>
                </View>

                {/* Date of Birth */}
                <View className="z-20">
                    <Text className="text-text-primary font-medium mb-1.5 ml-1">Date of Birth</Text>
                    <TouchableOpacity 
                        onPress={() => setOpen(true)}
                        className="bg-white border border-gray-300 rounded-xl px-4 h-12 flex-row items-center justify-between"
                    >
                        <Text className={dob ? "text-text-primary" : "text-[#9CA3AF]"}>{dob || "Select Date"}</Text>
                        <CalendarIcon size={20} color="#6B7280" />
                    </TouchableOpacity>
                     
                    <DatePicker
                        modal
                        open={open}
                        date={date}
                        mode="date"
                        maximumDate={new Date()}
                        onConfirm={(date: Date) => {
                            setOpen(false);
                            setDate(date);
                            // Format: YYYY-MM-DD using local time to avoid UTC timezone shift
                            const year = date.getFullYear();
                            const month = String(date.getMonth() + 1).padStart(2, '0');
                            const day = String(date.getDate()).padStart(2, '0');
                            setDob(`${year}-${month}-${day}`);
                        }}
                        onCancel={() => {
                            setOpen(false);
                        }}
                    />
                </View>

                {/* Gender */}
                <View className="z-10">
                    <Text className="text-text-primary font-medium mb-1.5 ml-1">Gender</Text>
                    <TouchableOpacity 
                        onPress={() => setShowGenderPicker(!showGenderPicker)}
                        className="bg-white border border-gray-300 rounded-xl px-4 h-12 flex-row items-center justify-between"
                    >
                        <Text className={gender ? "text-text-primary" : "text-[#9CA3AF]"}>{gender || "Select a Gender"}</Text>
                        <ChevronDown size={20} color="#6B7280" />
                    </TouchableOpacity>
                    
                    {showGenderPicker && (
                         <View className="absolute top-14 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
                            {['Male', 'Female', 'Other'].map((opt) => (
                                <TouchableOpacity 
                                    key={opt}
                                    className="px-4 py-3 border-b border-gray-100 last:border-0 active:bg-gray-50"
                                    onPress={() => {
                                        setGender(opt);
                                        setShowGenderPicker(false);
                                    }}
                                >
                                    <Text className="text-text-primary">{opt}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* View Terms & Privacy Policy */}
                <View className="mt-2 gap-2">
                    <Text className="text-text-primary font-medium ml-1 text-sm">Review before signing up:</Text>
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            onPress={() => { setLegalModalTitle('Terms & Conditions'); setLegalModalUrl(`${WEB_APP_URL}/terms-condition`); }}
                            className="flex-1 bg-white border border-gray-300 rounded-xl py-3 items-center"
                        >
                            <Text className="text-primary font-semibold text-sm">Terms & Conditions</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { setLegalModalTitle('Privacy Policy'); setLegalModalUrl(`${WEB_APP_URL}/privacy-policy-mobile`); }}
                            className="flex-1 bg-white border border-gray-300 rounded-xl py-3 items-center"
                        >
                            <Text className="text-primary font-semibold text-sm">Privacy Policy</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Terms Checkbox */}
                <TouchableOpacity
                    className="flex-row items-center mt-2"
                    onPress={() => setTermsAccepted(!termsAccepted)}
                >
                    <View className={`w-5 h-5 rounded border mr-2 items-center justify-center ${termsAccepted ? 'bg-teal border-teal' : 'bg-white border-gray-400'}`}>
                        {termsAccepted && <Text className="text-white text-xs">✓</Text>}
                    </View>
                    <Text className="text-text-secondary text-xs flex-1">
                        I have read and accept the Terms & Conditions and Privacy Policy.
                    </Text>
                </TouchableOpacity>

                {/* Continue Button */}
                <TouchableOpacity 
                    onPress={handleContinue}
                    disabled={isLoading}
                    className="h-14 bg-[#2CAEA6] rounded-xl items-center justify-center mt-6 active:opacity-90 shadow-sm"
                >
                    {isLoading ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <Text className="text-white font-semibold text-lg">Continue</Text>
                    )}
                </TouchableOpacity>

                 {/* Back to Login link if needed here, or handle in parent */}
                 {/* <TouchableOpacity onPress={onBack} className="items-center mt-4 mb-2">
                     <Text className="text-text-secondary">Already have an account? <Text className="text-teal font-medium">Log in</Text></Text>
                 </TouchableOpacity> */}
            </View>

            {/* Legal Document Modal */}
            <Modal visible={!!legalModalUrl} animationType="slide" presentationStyle="pageSheet">
                <View style={{ flex: 1, backgroundColor: 'white', paddingTop: Platform.OS === 'ios' ? 56 : 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                        <Text style={{ fontSize: 17, fontWeight: '600', color: '#1B2C3F' }}>{legalModalTitle}</Text>
                        <TouchableOpacity onPress={() => setLegalModalUrl(null)} style={{ padding: 4 }}>
                            <X size={24} color="#6C7074" />
                        </TouchableOpacity>
                    </View>
                    {legalModalUrl && (
                        <WebView
                            source={{ uri: legalModalUrl }}
                            style={{ flex: 1 }}
                            startInLoadingState
                            renderLoading={() => (
                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                                    <ActivityIndicator size="large" color="#70A263" />
                                </View>
                            )}
                        />
                    )}
                </View>
            </Modal>
        </ScrollView>
    );
};
