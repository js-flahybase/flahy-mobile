import React from 'react';
import { Text, View } from 'react-native';
import {
  MEDICAL_DISCLAIMER,
  MEDICAL_DISCLAIMER_SHORT,
} from '../constants/medicalDisclaimer';
import { colors } from '../theme/colors';

type MedicalDisclaimerProps = {
  variant?: 'full' | 'short';
  className?: string;
};

export const MedicalDisclaimer = ({
  variant = 'short',
  className = '',
}: MedicalDisclaimerProps) => {
  const text =
    variant === 'full' ? MEDICAL_DISCLAIMER : MEDICAL_DISCLAIMER_SHORT;

  return (
    <View
      className={`rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 ${className}`}
    >
      <Text
        style={{
          fontSize: variant === 'full' ? 13 : 12,
          lineHeight: variant === 'full' ? 20 : 18,
          color: colors['text-secondary'],
          textAlign: 'center',
        }}
      >
        {text}
      </Text>
    </View>
  );
};
