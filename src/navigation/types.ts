
export type RootStackParamList = {
  Login: { initialMode?: 'welcome' | 'login' | 'signup' } | undefined;
  Dashboard: undefined;
  ConsentRequired: undefined;
  Settings: undefined;
  Upload: undefined;
  Camera: undefined;
  Reports: undefined;
  ReportViewer: { reportId: string };
  FileViewer: { file: any };
  FlahyAI: undefined;
  Supplements: undefined;
  SchedulePickup: undefined;
};
