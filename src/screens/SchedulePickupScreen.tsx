import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, ChevronDown } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Calendar, DateData, LocaleConfig } from 'react-native-calendars';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { CustomAlert } from '../components/CustomAlert';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { userService } from '../services/userService';
import { useAuthStore } from '../store/authStore';

// Blood draw hours: 7 AM to 6 PM, in 30-minute slots.
const HOUR_OPTIONS = ['7 AM', '8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM'];
const MINUTE_OPTIONS = ['00', '30'];

const OptionPickerModal = ({
    visible,
    title,
    options,
    selected,
    onSelect,
    onClose,
}: {
    visible: boolean;
    title: string;
    options: string[];
    selected: string;
    onSelect: (value: string) => void;
    onClose: () => void;
}) => (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <TouchableOpacity
            activeOpacity={1}
            onPress={onClose}
            className="flex-1 bg-black/40 justify-center px-10"
        >
            <View className="bg-white rounded-2xl overflow-hidden max-h-[360px]">
                <Text className="text-center font-semibold text-[#2F2F2F] py-3 border-b border-gray-100">
                    {title}
                </Text>
                <ScrollView showsVerticalScrollIndicator={false}>
                    {options.map(option => (
                        <TouchableOpacity
                            key={option}
                            onPress={() => {
                                onSelect(option);
                                onClose();
                            }}
                            className={`py-3 px-4 ${selected === option ? 'bg-[#4FB5B0]/10' : ''}`}
                        >
                            <Text
                                className={`text-center text-base ${selected === option ? 'text-[#4FB5B0] font-semibold' : 'text-[#2F2F2F]'}`}
                            >
                                {option}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
        </TouchableOpacity>
    </Modal>
);

const formatSelectedDate = (dateString: string): string => {
    // Parse Y/M/D as local-time components (not via `new Date(dateString)`,
    // which parses as UTC and can display the wrong day in some timezones).
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });
};

const isConsentMissingError = (err: any) => {
    const status = err?.response?.status;
    const errors = err?.response?.data?.errors;
    return (
        status === 412 &&
        Array.isArray(errors) &&
        errors.some((e: any) => e?.consentMissing === true)
    );
};

// Configure locale if needed (optional, keeping default for now)
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

export const SchedulePickupScreen = () => {
    const navigation = useNavigation();
    const [selectedDate, setSelectedDate] = useState('');
    const [time, setTime] = useState('');
    const [address, setAddress] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const [selectedHour, setSelectedHour] = useState('');
    const [selectedMinute, setSelectedMinute] = useState('');
    const [hourPickerOpen, setHourPickerOpen] = useState(false);
    const [minutePickerOpen, setMinutePickerOpen] = useState(false);

    const updateTime = (hour: string, minute: string) => {
        if (!hour || !minute) return;
        const [num, meridiem] = hour.split(' ');
        setTime(`${num}:${minute} ${meridiem}`);
    };

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
        // If success, go back after closing alert
        if (alertConfig.type === 'success') {
            navigation.goBack();
        }
    };

    const onDayPress = (day: DateData) => {
        setSelectedDate(day.dateString);
    };

    const handleConfirm = async () => {
        if (!selectedDate || !time.trim() || !address.trim()) {
            showAlert("Missing Details", "Please fill in all fields (Date, Time, Address).", 'error');
            return;
        }
        
        setIsLoading(true);
        try {
            await userService.schedulePickup(selectedDate, time, address);
            
            // Refetch profile to get updated status from server
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
                 // Fallback: update locally if fetch fails
                 const user = useAuthStore.getState().user;
                 if (user) {
                     useAuthStore.getState().setUser({ ...user, can_schedule_appointment: false });
                 }
            }

            showAlert("Blood Draw Scheduled", `Blood draw scheduled for ${selectedDate} at ${time}. Our team will contact you shortly.`, 'success');
        } catch (error: any) {
            console.error("Pickup scheduling failed", error);
            showAlert("Error", error.response?.data?.message || "Failed to schedule blood draw. Please try again.", 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const today = new Date().toISOString().split('T')[0];

    return (
        <ScreenWrapper className="flex-1 bg-[#FFFBE6]">
            <KeyboardAwareScrollView 
                contentContainerStyle={{ flexGrow: 1 }}
                enableOnAndroid={true}
                extraScrollHeight={20}
                showsVerticalScrollIndicator={false}
            >
                {/* Header */}
                <View className="flex-row items-center px-6 py-4">
                    <TouchableOpacity 
                        onPress={() => navigation.goBack()}
                        className="p-2 -ml-2 rounded-full active:bg-gray-100"
                    >
                        <ArrowLeft size={24} color="#2F2F2F" />
                    </TouchableOpacity>
                    <Text className="text-xl font-bold text-[#2F2F2F] ml-2">Schedule Blood Draw</Text>
                </View>

                {/* Content */}
                <View className="flex-1 px-6 pt-4 pb-10">
                    <Text className="text-base text-gray-600 mb-6 text-center">
                        Please select a preferred date for your blood draw.
                    </Text>

                    <View className="bg-white rounded-2xl shadow-sm overflow-hidden p-4">
                        <Calendar
                            // Initially visible month. Default = Date()
                            current={today}
                            // Minimum date that can be selected, dates before minDate will be grayed out. Default = undefined
                            minDate={today}
                            // Handler which gets executed on day press. Default = undefined
                            onDayPress={onDayPress}
                            // Month format in calendar title. Formatting values: http://arshaw.com/xdate/#Formatting
                            monthFormat={'MMMM yyyy'}
                            // Hide month navigation arrows. Default = false
                            hideArrows={false}
                            // Do not show days of other months in month page. Default = false
                            hideExtraDays={true}
                            // If hideArrows = false and hideExtraDays = false do not switch month when tapping on greyed out
                            // day from another month that is visible in calendar page. Default = false
                            disableMonthChange={true}
                            // If firstDay=1 week starts from Monday. Note that dayNames and dayNamesShort should still start from Sunday
                            firstDay={1}
                            // Enable the option to swipe between months. Default = false
                            enableSwipeMonths={true}
                            
                            // Styling
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
                                textDayFontFamily: 'System', // Use default system fonts
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

                    {/* Time Input (Hour + Minute dropdowns, 7 AM - 6 PM, 30-min slots) */}
                    <View className="mt-8 mb-4">
                        <Text className="text-gray-700 font-medium mb-2">Preferred Time</Text>
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setHourPickerOpen(true)}
                                className="flex-1 bg-white p-4 rounded-xl shadow-sm flex-row items-center justify-between"
                            >
                                <Text className={selectedHour ? "text-[#2F2F2F]" : "text-[#9CA3AF]"}>
                                    {selectedHour || "Hour"}
                                </Text>
                                <ChevronDown size={18} color="#6B7280" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => setMinutePickerOpen(true)}
                                className="flex-1 bg-white p-4 rounded-xl shadow-sm flex-row items-center justify-between"
                            >
                                <Text className={selectedMinute !== '' ? "text-[#2F2F2F]" : "text-[#9CA3AF]"}>
                                    {selectedMinute !== '' ? `:${selectedMinute}` : "Minute"}
                                </Text>
                                <ChevronDown size={18} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <OptionPickerModal
                            visible={hourPickerOpen}
                            title="Select Hour"
                            options={HOUR_OPTIONS}
                            selected={selectedHour}
                            onSelect={hour => {
                                setSelectedHour(hour);
                                updateTime(hour, selectedMinute);
                            }}
                            onClose={() => setHourPickerOpen(false)}
                        />
                        <OptionPickerModal
                            visible={minutePickerOpen}
                            title="Select Minute"
                            options={MINUTE_OPTIONS}
                            selected={selectedMinute}
                            onSelect={minute => {
                                setSelectedMinute(minute);
                                updateTime(selectedHour, minute);
                            }}
                            onClose={() => setMinutePickerOpen(false)}
                        />
                    </View>

                    {/* Address Input */}
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

                    {/* Action Button */}
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
