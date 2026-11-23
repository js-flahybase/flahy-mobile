export const API_BASE_URL = 'https://api.flahyhealth.com';
// export const API_BASE_URL = 'https://flahyhealth-api-dev-bccjctfkg7g4d2gg.centralindia-01.azurewebsites.net';
// export const API_BASE_URL =
//   'https://62c1-2405-201-5023-4090-e546-8204-82a7-3c9d.ngrok-free.app/';
// export const API_BASE_URL =
//   'https://polyarchical-makeda-presacral.ngrok-free.dev';
export const WEB_APP_URL = 'https://flahyhealth.com';
// export const WEB_APP_URL = 'https://flahyhealth-app-dev-h0ezguhddjb6dpfk.centralindia-01.azurewebsites.net';
export const API_TIMEOUT = 15000;

export const patientApiRoutes = {
  reportList: '/api/report/report-list',
  // The listing the dashboard/FlahyAI use to decide "does this user have
  // reports" - unlike reportList (lab-ordered, sample-linked, requires a
  // sample_id), this also includes reports the user uploaded themselves.
  getFlahyReports: '/api/report/user-flahy-report',
  downloadReport: '/api/report/download-report',
};
