import { ChevronLeft } from 'lucide-react-native';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';
import { NotificationModal } from './NotificationModal';

interface HeaderProps {
    showBack?: boolean;
    onBack?: () => void;
    title?: string;
    subtitle?: string;
    minimal?: boolean;
}

export const Header = ({ showBack, onBack, title, subtitle, minimal }: HeaderProps) => {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  return (
    <>
      <View className={`flex-row justify-center items-center px-5 py-3 bg-white relative min-h-[60px] ${minimal ? '' : 'border-b border-gray-100'}`}>
        {showBack && (
            <TouchableOpacity 
                onPress={onBack}
                className={minimal ? 'absolute left-3 z-10 p-2' : 'absolute left-5 z-10 p-2 rounded-full bg-gray-50 active:bg-gray-100'}
            >
                <ChevronLeft size={minimal ? 28 : 24} color={minimal ? colors['text-primary'] : '#1f2937'} />
            </TouchableOpacity>
        )}

        {!minimal && (
        <View className="items-center justify-center">
            {title ? (
                <>
                    <Text className="text-text-primary font-bold text-lg">{title}</Text>
                    {subtitle && (
                        <Text className="text-text-secondary text-xs font-medium mt-0.5">{subtitle}</Text>
                    )}
                </>
            ) : (
                <Text className="text-primary font-bold text-2xl tracking-[0.2em] font-modern">FLAHY</Text>
            )}
        </View>
        )}

      </View>

      <NotificationModal
        visible={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />
    </>
  );
};
