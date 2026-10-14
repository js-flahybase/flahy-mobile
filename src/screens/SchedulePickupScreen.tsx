import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Clock } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import DatePicker from 'react-native-date-picker';
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
const LAST_START_MINUTES = SLOT_END_MINUTES - SLOT_DURATION_MINUTES; // 5:30 PM

const formatClock = (totalMinutes: number) => {
    const hours24 = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
};

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

const parseDateString = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const dateWithMinutes = (base: Date, totalMinutes: number) => {
    const d = new Date(base);
    d.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    return d;
};

/** Next valid 30-min start after "now" (exclusive of current partial slot). */
const nextHalfHourStartMinutes = (now: Date) => {
    const minutes = now.getHours() * 60 + now.getMinutes();
    return Math.ceil((minutes + 1) / SLOT_DURATION_MINUTES) * SLOT_DURATION_MINUTES;
};

const getSelectableStartRange = (selectedDate: string) => {
    let minStart = SLOT_START_MINUTES;
    if (selectedDate === getTodayString()) {
        minStart = Math.max(SLOT_START_MINUTES, nextHalfHourStartMinutes(new Date()));
    }
    return {
        minStart,
        maxStart: LAST_START_MINUTES,
        hasSlots: minStart <= LAST_START_MINUTES,
    };
};

const toSlotValue = (date: Date) => {
    const startMinutes = date.getHours() * 60 + date.getMinutes();
    const endMinutes = startMinutes + SLOT_DURATION_MINUTES;
    return `${formatClock(startMinutes)} - ${formatClock(endMinutes)}`;
};

export const SchedulePickupScreen = () => {
    const navigation = useNavigation();
    const [selectedDate, setSelectedDate] = useState('');
    const [time, setTime] = useState('');
    const [address, setAddress] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [pickerDate, setPickerDate] = useState(() => dateWithMinutes(new Date(), 9 * 60));
    const [open, setOpen] = useState(false);

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

    const timeBounds = useMemo(() => {
        if (!selectedDate) {
            return null;
        }
        const base = parseDateString(selectedDate);
        const { minStart, maxStart, hasSlots } = getSelectableStartRange(selectedDate);
        return {
            hasSlots,
            minimumDate: dateWithMinutes(base, minStart),
            maximumDate: dateWithMinutes(base, maxStart),
            defaultDate: dateWithMinutes(base, Math.min(Math.max(minStart, 9 * 60), maxStart)),
        };
    }, [selectedDate]);

    const onDayPress = (day: DateData) => {
        setSelectedDate(day.dateString);
        setTime('');
    };

    const openTimePicker = () => {
        if (!selectedDate) {
            showAlert('Select Date', 'Please select a date first.', 'info');
            return;
        }
        if (!timeBounds?.hasSlots) {
            showAlert(
                'No Slots Available',
                'No remaining time slots today. Please choose another date.',
                'info',
            );
            return;
        }

        // Keep current selection if still valid; otherwise start inside the allowed window.
        const currentMinutes = pickerDate.getHours() * 60 + pickerDate.getMinutes();
        const minM = timeBounds.minimumDate.getHours() * 60 + timeBounds.minimumDate.getMinutes();
        const maxM = timeBounds.maximumDate.getHours() * 60 + timeBounds.maximumDate.getMinutes();
        if (currentMinutes < minM || currentMinutes > maxM) {
            setPickerDate(timeBounds.defaultDate);
        } else {
            setPickerDate(dateWithMinutes(parseDateString(selectedDate), currentMinutes));
        }
        setOpen(true);
    };

    const handleTimeConfirm = (date: Date) => {
        setOpen(false);
        setPickerDate(date);
        setTime(toSlotValue(date));
    };

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
                        <TouchableOpacity
                            onPress={openTimePicker}
                            className="bg-white p-4 rounded-xl shadow-sm flex-row items-center justify-between"
                        >
                            <Text className={time ? 'text-[#2F2F2F]' : 'text-[#9CA3AF]'}>
                                {time || 'e.g. 10:00 AM - 10:30 AM'}
                            </Text>
                            <Clock size={20} color="#6B7280" />
                        </TouchableOpacity>

                        {timeBounds ? (
                            <DatePicker
                                modal
                                open={open}
                                date={pickerDate}
                                mode="time"
                                minuteInterval={30}
                                minimumDate={timeBounds.minimumDate}
                                maximumDate={timeBounds.maximumDate}
                                onConfirm={handleTimeConfirm}
                                onCancel={() => setOpen(false)}
                            />
                        ) : null}
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
