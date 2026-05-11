import api from './api';

export const userService = {
  getProfile: async () => {
    const response = await api.get('/api/user/profile');
    return response.data;
  },

  acceptConsent: async (data?: { email?: string; contact?: string }) => {
    const response = await api.post('/api/user/accept-consent', data || {});
    return response.data;
  },

  getFiles: async () => {
    const response = await api.get('/api/user/my-all-upload-files');
    return response.data;
  },

  uploadFile: async (fileData: any) => {
    // fileData should be FormData
    const response = await api.post('/api/user/my-upload', fileData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  getReports: async () => {
    const response = await api.get('/api/report/user-flahy-report');
    return response.data;
  },

  deleteFile: async (id: string) => {
    const response = await api.delete(`/api/report/${id}`);
    return response.data;
  },

  updateProfile: async (userId: string, data: any) => {
    const response = await api.put(`/api/user/${userId}`, data);
    return response.data;
  },

  createPassword: async (password: string, confirm_password: string) => {
    const response = await api.post('/api/user/create-password', { password, confirm_password });
    return response.data;
  },

  resetPassword: async (current_password: string, new_password: string, confirm_password: string) => {
    const response = await api.post('/api/user/reset-password', { current_password, new_password, confirm_password });
    return response.data;
  },

  schedulePickup: async (date: string, time: string, address: string) => {
    const response = await api.post('/appointment-scheduling', { date, time, address });
    return response.data;
  },

  requestSupplement: async (data: { name: string; dob: string; phone: string }) => {
    const response = await api.post('/supplement-request', data);
    return response.data;
  },

  deleteAccount: async (userId: string) => {
    const response = await api.delete(`/api/user/${userId}`);
    return response.data;
  }
};

