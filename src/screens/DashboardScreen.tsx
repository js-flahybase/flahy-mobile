import { pick, types } from '@react-native-documents/picker';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Calendar,
  Camera,
  CloudUpload,
  FileText,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  User,
  X,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { CustomAlert } from '../components/CustomAlert';
import { DataList } from '../components/DataList';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { SupplementIntakeModal } from '../components/SupplementIntakeModal';
import { RootStackParamList } from '../navigation/types';
import { userService } from '../services/userService';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

const isConsentMissingError = (err: any) => {
  const status = err?.response?.status;
  const errors = err?.response?.data?.errors;
  return (
    status === 412 &&
    Array.isArray(errors) &&
    errors.some((e: any) => e?.consentMissing === true)
  );
};

const USER_AVATAR =
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=facearea&facepad=2.25&w=256&h=256&q=80';

// Calculate consistent button size: 4 buttons + 3 gaps of 12px, inside 24px horizontal padding each side
const SCREEN_W = Dimensions.get('window').width;
const GRID_PADDING = 48; // 24px * 2
const GRID_GAP = 12;
const BTN_SIZE = Math.floor((SCREEN_W - GRID_PADDING - GRID_GAP * 3) / 4);

export const DashboardScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [searchText, setSearchText] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSupplementModalVisible, setIsSupplementModalVisible] =
    useState(false);
  const [hasReport, setHasReport] = useState(false);
  const user = useAuthStore(state => state.user);
  const setUser = useAuthStore(state => state.setUser);

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

  const showAlert = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
  ) => {
    setAlertConfig({ visible: true, title, message, type });
  };

  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  const fetchFiles = async () => {
    setIsLoading(true);
    try {
      const response = await userService.getFiles();
      console.log('🚀 ~ fetchFiles ~ response:', response);

      // Ensure we target the array in 'data'
      const list = Array.isArray(response.data)
        ? response.data
        : response.data?.data || [];

      const mappedFiles = list.map((file: any) => ({
        id: file.id,
        name: file.file_name || file.clientName || 'Unknown',
        uri: file.report_url || file.filePath,
        // Original file via download endpoint (same as web app)
        originalUri: file.id
          ? `https://api.flahyhealth.com/api/report/download-report/${file.id}`
          : file.report_url || file.filePath,
        type:
          file.extname ||
          (file.file_name ? file.file_name.split('.').pop() : 'unknown'),
        size: file.size || 0,
        date: file.created_at || file.createdAt,
      }));
      setUploadedFiles(mappedFiles);
    } catch (error) {
      console.error('Failed to fetch files', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      const response = await userService.getProfile();
      const userData =
        response?.data?.user || response?.user || response?.data || response;

      if (userData && typeof userData === 'object' && userData.id) {
        const current = useAuthStore.getState().user;
        setUser({ ...(current || {}), ...userData });
      } else {
        console.warn(
          'fetchProfile: unexpected profile response shape',
          response,
        );
      }
    } catch (error) {
      if (isConsentMissingError(error)) {
        navigation.navigate('ConsentRequired');
        return;
      }
      console.error('Failed to fetch profile', error);
    }
  };

  useEffect(() => {
    (async () => {
      await fetchProfile();
      fetchFiles();
      checkReport();
    })();
  }, []);

  const checkReport = async () => {
    try {
      const response = await userService.getReports();
      console.log('🚀 ~ checkReport ~ response:', response);
      // Response may be { data: [...] } or array directly
      const list = Array.isArray(response) ? response : response?.data || [];
      setHasReport(list.length > 0);
    } catch (error) {
      // If API fails, don't show button
      setHasReport(false);
    }
  };

  const handleDownloadReport = () => {
    navigation.navigate('Reports');
  };

  const handleFlahyAI = () => {
    navigation.navigate('FlahyAI');
  };

  const handleDeleteFile = (fileToDelete: any) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete ${fileToDelete.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await userService.deleteFile(fileToDelete.id);
              // Optimistic update or refresh
              const updatedList = uploadedFiles.filter(
                f => f.id !== fileToDelete.id,
              );
              setUploadedFiles(updatedList);
              Alert.alert('Success', 'File deleted successfully');
              // fetchFiles(); // Optional: double check with server
            } catch (error) {
              console.error('Delete failed', error);
              Alert.alert('Error', 'Failed to delete file. Please try again.');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleDownloadFile = async (file: any) => {
    try {
      const sourceUri = file.originalUri || file.uri;
      const fullUri = sourceUri?.startsWith('http')
        ? sourceUri
        : `https://api.flahyhealth.com${
            sourceUri?.startsWith('/') ? '' : '/'
          }${sourceUri}`;

      const token = useAuthStore.getState().token;
      const { dirs } = require('react-native-blob-util').default.fs;
      const RNBlobUtil = require('react-native-blob-util').default;
      const fileName = file.name || `file_${Date.now()}`;
      const cachePath = `${dirs.CacheDir}/${fileName}`;

      const res = await RNBlobUtil.config({
        fileCache: true,
        path: cachePath,
        timeout: 30000,
      }).fetch('GET', fullUri, {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      });

      const status = res.info().status;
      if (status < 200 || status >= 300) {
        Alert.alert('Error', `Download failed (status ${status})`);
        return;
      }

      const cachedPath = res.path();
      const ext = file.name?.split('.').pop()?.toLowerCase() || '';
      const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);

      if (Platform.OS === 'android') {
        const mimeMap: Record<string, string> = {
          pdf: 'application/pdf',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
        };
        await RNBlobUtil.MediaCollection.copyToMediaStore(
          {
            name: fileName,
            parentFolder: '',
            mimeType: mimeMap[ext] || 'application/octet-stream',
          },
          isImg ? 'Image' : 'Download',
          cachedPath,
        );
        Alert.alert(
          'Saved!',
          isImg ? 'Image saved to Gallery.' : 'File saved to Downloads.',
        );
      } else {
        if (isImg) {
          const {
            CameraRoll,
          } = require('@react-native-camera-roll/camera-roll');
          const fileUri = cachedPath.startsWith('file://')
            ? cachedPath
            : `file://${cachedPath}`;
          await CameraRoll.saveAsset(fileUri, { type: 'photo' });
          Alert.alert('Saved!', 'Image saved to Photos.');
        } else {
          // iOS: Use Share to allow 'Save to Files'
          const { Share } = require('react-native');
          const fileUri = cachedPath.startsWith('file://')
            ? cachedPath
            : `file://${cachedPath}`;
          await Share.share({
            url: fileUri,
          });
        }
      }
    } catch (error: any) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Could not download file.');
    }
  };

  const uploadFileToServer = async (file: any) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        type: file.type,
        name: file.name,
      });

      await userService.uploadFile(formData);
      Alert.alert('Success', 'File uploaded successfully');
      fetchFiles();
    } catch (error: any) {
      Alert.alert('Error', 'Failed to upload file');
      console.error('Upload failed:', error);
      if (error.response) {
        console.error('Error response:', error.response.data);
        console.error('Error status:', error.response.status);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleUpload = () => {
    Alert.alert('Upload', 'Choose source', [
      { text: 'Files', onPress: pickDocument },
      { text: 'Photos', onPress: pickImage },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickDocument = async () => {
    try {
      const results = await pick({
        type: [types.allFiles],
        allowMultiSelection: false,
      });
      if (results && results[0]) {
        const doc = results[0];

        console.log('Selected Doc:', doc);
        // Client-side validation to match API requirements
        const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'dcm'];
        const extension = doc.name?.split('.').pop()?.toLowerCase();
        console.log('Detected Extension:', extension);

        if (!extension || !allowedExtensions.includes(extension)) {
          // Alert.alert("Invalid File", `File type ${extension} not allowed. Only pdf, jpg, png, dcm.`);
          // return;
          console.log('Validation failed but proceeding for debugging...');
        }

        const file = {
          uri: doc.uri,
          name: doc.name || `document.${extension || 'pdf'}`,
          type:
            doc.type ||
            (extension === 'pdf'
              ? 'application/pdf'
              : 'application/octet-stream'),
          size: doc.size,
        };
        console.log('Picking Document:', file);
        uploadFileToServer(file);
      }
    } catch (err: any) {
      if (err.code === 'DOCUMENT_PICKER_CANCELED') return;
      console.error('Unknown Error: ', err);
    }
  };

  const pickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
    });

    if (result.assets && result.assets[0]) {
      const asset = result.assets[0];
      const file = {
        uri: asset.uri,
        name: asset.fileName,
        type: asset.type,
        size: asset.fileSize,
      };
      uploadFileToServer(file);
    }
  };

  const handleCamera = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'Flahy needs access to your camera to take photos.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permission Denied',
            'Camera permission is required to take photos.',
          );
          return;
        }
      } catch (err) {
        console.warn(err);
        return;
      }
    }

    const result = await launchCamera({
      mediaType: 'photo',
      saveToPhotos: true,
    });

    if (result.assets && result.assets[0]) {
      const asset = result.assets[0];
      const file = {
        uri: asset.uri,
        name: asset.fileName,
        type: asset.type,
        size: asset.fileSize,
      };
      uploadFileToServer(file);
    }
  };

  return (
    <ScreenWrapper className="flex-1 bg-background" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              fetchProfile();
              fetchFiles();
              checkReport();
            }}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-4 pb-2">
          {/* User Greeting and Avatar Row */}
          {/* User Greeting and Avatar Row */}
          <View className="flex-row justify-between items-center">
            <View className="flex-row flex-1 items-center mr-4">
              <Image
                source={require('../assets/flahy_icon.png')}
                className="mr-3 w-10 h-10"
                resizeMode="contain"
              />
              <View>
                <Text className="text-lg font-bold text-text-primary">
                  Hi {user?.first_name || 'User'}
                </Text>
                {/* <Text className="text-xl font-bold text-text-primary font-modern">Welcome to Dashboard</Text> */}
              </View>
            </View>
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              className="justify-center items-center w-12 h-12 rounded-full border bg-teal/10 border-teal/20"
            >
              <User size={24} color={colors.teal} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View
          style={{ paddingHorizontal: 24, marginTop: 20, marginBottom: 28 }}
        >
          <View
            style={{
              backgroundColor: 'white',
              borderWidth: 1,
              borderColor: searchText ? colors.primary : '#E5E7EB',
              borderRadius: 16,
              height: 48,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 14,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 3,
              elevation: 1,
            }}
          >
            <Search
              size={18}
              color={searchText ? colors.primary : colors['text-secondary']}
            />
            <TextInput
              style={{
                flex: 1,
                marginLeft: 10,
                fontSize: 15,
                color: colors['text-primary'],
                padding: 0,
              }}
              placeholder="Search files..."
              placeholderTextColor={colors['text-secondary']}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchText('')}
                style={{ padding: 4 }}
              >
                <X size={16} color={colors['text-secondary']} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Action Hero Section */}
        {/* Action Hero Section */}
        <View className="bg-[#E2F1E6] rounded-t-[40px] px-6 pt-8 pb-10 -mb-10 min-h-[500px]">
          {/* Schedule Pick-up Button - Only show if user can schedule */}
          {user?.can_schedule_appointment !== false && (
            <TouchableOpacity
              onPress={() => navigation.navigate('SchedulePickup')}
              className="flex-row justify-center items-center mb-4 w-full h-14 rounded-xl shadow-sm bg-teal active:opacity-90"
            >
              <Calendar size={20} color="white" />
              <Text className="ml-2 text-base font-semibold text-white">
                Schedule Pick-up
              </Text>
            </TouchableOpacity>
          )}

          {/* Download Report Button — only shown when user has a report */}
          {hasReport && (
            <TouchableOpacity
              onPress={handleDownloadReport}
              className="flex-row justify-center items-center mb-4 w-full h-14 rounded-xl shadow-sm bg-teal active:opacity-90"
            >
              <FileText size={20} color="white" />
              <Text className="ml-2 text-base font-semibold text-white">
                View Your Flahy Report
              </Text>
            </TouchableOpacity>
          )}

          {/* Products Button — only show when user has a report */}
          {/* {hasReport && (
            <TouchableOpacity
              onPress={() => navigation.navigate('Supplements')}
              className="flex-row justify-center items-center mb-6 w-full h-14 rounded-xl shadow-sm bg-teal active:opacity-90"
            >
              <Package size={20} color="white" />
              <Text className="ml-2 text-base font-semibold text-white">
                Products
              </Text>
            </TouchableOpacity>
          )} */}

          {/* Action Grid */}
          <View
            style={{ flexDirection: 'row', gap: GRID_GAP, marginBottom: 32 }}
          >
            {/* FlahyAI — only show when user has a report */}
            {hasReport && (
              <TouchableOpacity
                onPress={handleFlahyAI}
                style={{
                  width: BTN_SIZE,
                  height: BTN_SIZE,
                  backgroundColor: colors.teal,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Sparkles size={28} color="white" />
                <Text
                  style={{
                    color: 'white',
                    fontWeight: '500',
                    fontSize: 12,
                    marginTop: 6,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  FlahyAI
                </Text>
              </TouchableOpacity>
            )}

            {/* Upload */}
            <TouchableOpacity
              onPress={handleUpload}
              disabled={isUploading}
              style={{
                width: BTN_SIZE,
                height: BTN_SIZE,
                backgroundColor: colors.teal,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isUploading ? (
                <ActivityIndicator color="white" />
              ) : (
                <CloudUpload size={28} color="white" />
              )}
              <Text
                style={{
                  color: 'white',
                  fontWeight: '500',
                  fontSize: 12,
                  marginTop: 6,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Upload
              </Text>
            </TouchableOpacity>

            {/* Camera */}
            <TouchableOpacity
              onPress={handleCamera}
              style={{
                width: BTN_SIZE,
                height: BTN_SIZE,
                backgroundColor: colors.teal,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Camera size={28} color="white" />
              <Text
                style={{
                  color: 'white',
                  fontWeight: '500',
                  fontSize: 12,
                  marginTop: 6,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                Camera
              </Text>
            </TouchableOpacity>

            {/* Supplements (Intake Modal) — only show when user has a report */}
            {hasReport && (
              <TouchableOpacity
                onPress={() => setIsSupplementModalVisible(true)}
                style={{
                  width: BTN_SIZE,
                  height: BTN_SIZE,
                  backgroundColor: colors.teal,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShoppingBag size={28} color="white" />
                <Text
                  style={{
                    color: 'white',
                    fontWeight: '500',
                    fontSize: 12,
                    marginTop: 6,
                  }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  Supplements
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* My Data Section Header in White Card Area */}
          <View className="bg-white rounded-t-[40px] pt-8 min-h-[400px] shadow-sm -mx-6">
            <DataList
              data={
                searchText
                  ? uploadedFiles.filter(f =>
                      f.name?.toLowerCase().includes(searchText.toLowerCase()),
                    )
                  : uploadedFiles
              }
              onDelete={handleDeleteFile}
              onDownload={handleDownloadFile}
              onPress={file => {
                console.log('File clicked:', file.name);
                navigation.navigate('FileViewer', { file });
              }}
              emptyMessage={
                searchText ? 'No files matching your search.' : 'No Data Found.'
              }
            />
          </View>
        </View>
      </ScrollView>

      <SupplementIntakeModal
        visible={isSupplementModalVisible}
        onClose={() => setIsSupplementModalVisible(false)}
        onSubmit={({ name, dob, phone, message }) => {
          showAlert('Success', message, 'success');
        }}
      />

      <CustomAlert
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={hideAlert}
      />
    </ScreenWrapper>
  );
};
