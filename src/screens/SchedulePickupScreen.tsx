import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, Clock } from 'lucide-react-native';
import React, { useState } from 'react';
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

    const [date, setDate] = useState(new Date());
    const [open, setOpen] = useState(false);

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

            showAlert("Pickup Scheduled", `Pickup scheduled for ${selectedDate} at ${time}. Our team will contact you shortly.`, 'success');
        } catch (error: any) {
            console.error("Pickup scheduling failed", error);
            showAlert("Error", error.response?.data?.message || "Failed to schedule pickup. Please try again.", 'error');
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
                    <Text className="text-xl font-bold text-[#2F2F2F] ml-2">Schedule Pick-up</Text>
                </View>

                {/* Content */}
                <View className="flex-1 px-6 pt-4 pb-10">
                    <Text className="text-base text-gray-600 mb-6 text-center">
                        Please select a preferred date for your sample pickup.
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

                    {/* Time Input (Native Picker) */}
                    <View className="mt-8 mb-4">
                        <Text className="text-gray-700 font-medium mb-2">Preferred Time</Text>
                        <TouchableOpacity 
                            onPress={() => setOpen(true)}
                            className="bg-white p-4 rounded-xl shadow-sm flex-row items-center justify-between"
                        >
                            <Text className={time ? "text-[#2F2F2F]" : "text-[#9CA3AF]"}>
                                {time || "e.g. 10:00 AM"}
                            </Text>
                            <Clock size={20} color="#6B7280" />
                        </TouchableOpacity>
                        
                        <DatePicker
                            modal
                            open={open}
                            date={date}
                            mode="time"
                            onConfirm={(date) => {
                                setOpen(false)
                                setDate(date)
                                // Format to HH:mm A
                                const formatted = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                setTime(formatted)
                            }}
                            onCancel={() => {
                                setOpen(false)
                            }}
                        />
                    </View>

                    {/* Address Input */}
                    <View className="mb-6">
                        <Text className="text-gray-700 font-medium mb-2">Pickup Address</Text>
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
                                <Text className="text-white text-lg font-bold">Confirm Pickup</Text>
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
