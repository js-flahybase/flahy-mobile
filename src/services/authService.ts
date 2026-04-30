import api from './api';

export const authService = {
  sendOtp: async (
    contact: string,
    country_code: string,
    login_type: number,
  ) => {
    // Endpoint inferred via investigation: /api/auth/user/send-otp
    const payload: Record<string, unknown> = { contact, login_type };
    if (country_code) payload.country_code = country_code;
    const response = await api.post('/api/auth/user/send-otp', payload);
    console.log('🚀 ~ response:', response);
    return response.data;
  },

  // https://flahyhealth.com/user/auth/login

  verifyOtp: async (
    contact: string,
    otp: string,
    login_type: number,
    country_code: string,
  ) => {
    console.log('🚀 ~ otp:', otp);
    const payload: Record<string, unknown> = { contact, otp, login_type };
    if (country_code) payload.country_code = country_code;
    const response = await api.post('/api/auth/user/verify-otp', payload);
    console.log('🚀 ~ response:', response);
    return response.data;
  },

  verifyContact: async (contact: string) => {
    const response = await api.post('/api/auth/user/login/check-type', {
      input_value: contact,
    });
    return response.data;
  },

  registerUser: async (userData: any) => {
    const response = await api.post('/api/user/register-user', {
      ...userData,
      user_type: 'user',
      consent: userData.termsAccepted ?? false,
    });
    return response.data;
  },

  logout: async () => {
    await api.post('/api/auth/user/logout');
  },
};
