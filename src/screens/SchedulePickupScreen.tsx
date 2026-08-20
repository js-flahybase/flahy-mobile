import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { CustomAlert } from '../components/CustomAlert';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { userService } from '../services/userService';
import { useAuthStore } from '../store/authStore';

const isConsentMissingError = (err: any) => {
    const status = err?.response?.status;
    const errors = err?.response?.data?.errors;
    return (
        status === 412 &&
        Array.isArray(errors) &&
        errors.some((e: any) => e?.consentMissing === true)
    );
};

LocaleConfig.locales['en'] = {
  monthNames: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ],
  monthNamesShort: ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'],
  dayNames: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  dayNamesShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  today: "Today"
};
LocaleConfig.defaultLocale = 'en';

// 7 AM to 6 PM, Monday–Sunday, 30-minute slots.
const SLOT_START_MINUTES = 7 * 60;
const SLOT_END_MINUTES = 18 * 60;
const SLOT_DURATION_MINUTES = 30;

const formatClock = (totalMinutes: number) => {
    const hours24 = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
};

type TimeSlot = {
    id: string;
    label: string;
    value: string;
    startMinutes: number;
};

const generateBloodDrawSlots = (): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    for (
        let start = SLOT_START_MINUTES;
        start + SLOT_DURATION_MINUTES <= SLOT_END_MINUTES;
        start += SLOT_DURATION_MINUTES
    ) {
        const end = start + SLOT_DURATION_MINUTES;
        const startLabel = formatClock(start);
        const endLabel = formatClock(end);
        slots.push({
            id: `${start}`,
            label: `${startLabel} - ${endLabel}`,
            value: `${startLabel} - ${endLabel}`,
            startMinutes: start,
        });
    }
    return slots;
};

const ALL_SLOTS = generateBloodDrawSlots();

const getTodayString = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

const formatSelectedDate = (dateString: string): string => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
};

export const SchedulePickupScreen = () => {
    const navigation = useNavigation();
    const [selectedDate, setSelectedDate] = useState('');
    const [time, setTime] = useState('');
    const [address, setAddress] = useState('');
    const [isLoading, setIsLoading] = useState(false);

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
        if (alertConfig.type === 'success') {
            navigation.goBack();
        }
    };

    const onDayPress = (day: DateData) => {
        setSelectedDate(day.dateString);
        setTime('');
    };

    const availableSlots = useMemo(() => {
        if (!selectedDate) {
            return ALL_SLOTS;
        }
        const today = getTodayString();
        if (selectedDate !== today) {
            return ALL_SLOTS;
        }
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        return ALL_SLOTS.filter(slot => slot.startMinutes > nowMinutes);
    }, [selectedDate]);

    const handleConfirm = async () => {
        if (!selectedDate || !time.trim() || !address.trim()) {
            showAlert("Missing Details", "Please fill in all fields (Date, Time, Address).", 'error');
            return;
        }

        setIsLoading(true);
        try {
            await userService.schedulePickup(selectedDate, time, address);

            try {
                const profileResponse = await userService.getProfile();
                const freshUser = profileResponse.data || profileResponse;
                if (freshUser && freshUser.id) {
                    useAuthStore.getState().setUser(freshUser);
                }
            } catch (err) {
                if (isConsentMissingError(err)) {
                    // @ts-ignore
                    navigation.navigate('ConsentRequired');
                    return;
                }
                console.error("Failed to refresh profile after scheduling", err);
                 const user = useAuthStore.getState().user;
                 if (user) {
                     useAuthStore.getState().setUser({ ...user, can_schedule_appointment: false });
                 }
            }

            showAlert("Blood Draw Scheduled", `Blood draw scheduled for ${selectedDate} at ${time}. Our team will contact you shortly.`, 'success');
        } catch (error: any) {
            console.error("Blood draw scheduling failed", error);
            showAlert("Error", error.response?.data?.message || "Failed to schedule blood draw. Please try again.", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const today = getTodayString();

    return (
        <ScreenWrapper className="flex-1 bg-[#FFFBE6]">
            <KeyboardAwareScrollView
                contentContainerStyle={{ flexGrow: 1 }}
                enableOnAndroid={true}
                extraScrollHeight={20}
                showsVerticalScrollIndicator={false}
            >
                <View className="flex-row items-center px-6 py-4">
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        className="p-2 -ml-2 rounded-full active:bg-gray-100"
                    >
                        <ArrowLeft size={24} color="#2F2F2F" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-[#2F2F2F] ml-2">Schedule Blood Draw</Text>
                </View>

                <View className="flex-1 px-6 pt-4 pb-10">
                    <Text className="text-base text-gray-600 mb-6 text-center">
                        Please select a date and a 30-minute slot (7:00 AM – 6:00 PM, Monday to Sunday).
                    </Text>

                    <View className="bg-white rounded-2xl shadow-sm overflow-hidden p-4">
                        <Calendar
                            current={today}
                            minDate={today}
                            onDayPress={onDayPress}
                            monthFormat={'MMMM yyyy'}
                            hideArrows={false}
                            hideExtraDays={true}
                            disableMonthChange={true}
                            firstDay={1}
                            enableSwipeMonths={true}
                            theme={{
                                backgroundColor: '#ffffff',
                                calendarBackground: '#ffffff',
                                textSectionTitleColor: '#b6c1cd',
                                selectedDayBackgroundColor: '#4FB5B0',
                                selectedDayTextColor: '#ffffff',
                                todayTextColor: '#4FB5B0',
                                dayTextColor: '#2d4150',
                                textDisabledColor: '#d9e1e8',
                                dotColor: '#00adf5',
                                selectedDotColor: '#ffffff',
                                arrowColor: '#4FB5B0',
                                disabledArrowColor: '#d9e1e8',
                                monthTextColor: '#2F2F2F',
                                indicatorColor: '#4FB5B0',
                                textDayFontFamily: 'System',
                                textMonthFontFamily: 'System',
                                textDayHeaderFontFamily: 'System',
                                textDayFontWeight: '400',
                                textMonthFontWeight: 'bold',
                                textDayHeaderFontWeight: '500',
                                textDayFontSize: 16,
                                textMonthFontSize: 18,
                                textDayHeaderFontSize: 14
                            }}
                            markedDates={{
                                [selectedDate]: { selected: true, disableTouchEvent: true }
                            }}
                        />
                    </View>

                    {selectedDate ? (
                        <Text className="text-center text-[#4FB5B0] font-medium mt-3">
                            Selected date: {formatSelectedDate(selectedDate)}
                        </Text>
                    ) : null}

                    <View className="mt-8 mb-4">
                        <Text className="text-gray-700 font-medium mb-2">Preferred Time Slot</Text>
                        {!selectedDate ? (
                            <Text className="text-gray-400 text-sm">Select a date to see 30-minute slots.</Text>
                        ) : availableSlots.length === 0 ? (
                            <Text className="text-gray-500 text-sm">No remaining slots today. Please choose another date.</Text>
                        ) : (
                            <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                                {availableSlots.map(slot => {
                                    const selected = time === slot.value;
                                    return (
                                        <TouchableOpacity
                                            key={slot.id}
                                            onPress={() => setTime(slot.value)}
                                            className={`px-3 py-2.5 rounded-xl ${selected ? 'bg-[#4FB5B0]' : 'bg-white'}`}
                                            style={{ width: '48%' }}
                                        >
                                            <Text
                                                className={`text-center text-sm font-medium ${selected ? 'text-white' : 'text-[#2F2F2F]'}`}
                                            >
                                                {slot.label}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                    </View>

                    <View className="mb-6">
                        <Text className="text-gray-700 font-medium mb-2">Blood Draw Address</Text>
                        <TextInput
                            className="bg-white p-4 rounded-xl text-[#2F2F2F] shadow-sm min-h-[100px]"
                            placeholder="Enter full address"
                            placeholderTextColor="#9CA3AF"
                            multiline
                            textAlignVertical="top"
                            value={address}
                            onChangeText={setAddress}
                        />
                    </View>

                    <View className="mt-2 mb-10">
                         <TouchableOpacity
                            onPress={handleConfirm}
                            className={`w-full py-4 rounded-xl items-center shadow-sm ${selectedDate && time && address && !isLoading ? 'bg-[#4FB5B0]' : 'bg-gray-300'}`}
                            disabled={!selectedDate || !time || !address || isLoading}
                        >
                            {isLoading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text className="text-white text-lg font-bold">Schedule Blood Draw</Text>
                            )}
                        </TouchableOpacity>
                    </View>

                    <CustomAlert
                        visible={alertConfig.visible}
                        title={alertConfig.title}
                        message={alertConfig.message}
                        type={alertConfig.type}
                        onClose={hideAlert}
                    />

                </View>
            </KeyboardAwareScrollView>
        </ScreenWrapper>
    );
};
