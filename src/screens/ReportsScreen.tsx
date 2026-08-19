import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { RootStackParamList } from '../navigation/types';
import { userService } from '../services/userService';
import { colors } from '../theme/colors';

type ReportsScreenProps = NativeStackScreenProps<RootStackParamList, 'Reports'>;

// Reusing general structure but mapping from API file object
interface ReportFile {
    id: string;
    name: string;
    submitted: string;
    size: string;
    type: string;
    description: string;
    uri: string;
    originalUri: string;
}

export const ReportsScreen = ({ navigation }: ReportsScreenProps) => {
    const [reports, setReports] = useState<ReportFile[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        setIsLoading(true);
        try {
            const response = await userService.getReports();
            // Assuming the same endpoint serves all user files. 
            // We map them to the report structure.
            const mapped: ReportFile[] = (response.data || []).map((file: any) => ({
                id: file.id || String(Math.random()),
                name: file.file_name || 'Unknown File',
                submitted: file.created_at ? new Date(file.created_at).toLocaleDateString() : 'Unknown',
                size: '0 KB', // API missing size
                type: file.file_name?.split('.').pop() || 'doc',
                description: file.description || 'No description available for this file.',
                uri: file.report_url,
                originalUri: `https://api.flahyhealth.com/api/report/download-report/${file.id || file.report_id}`
            }));
            setReports(mapped);
        } catch (error) {
            console.error("Failed to fetch reports", error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleExpand = (id: string) => {
        setExpandedId(prev => prev === id ? null : id);
    };

    const handleDownload = async (file: ReportFile) => {
        try {
            const token = require('../store/authStore').useAuthStore.getState().token;
            const RNBlobUtil = require('react-native-blob-util').default;
            const { dirs } = RNBlobUtil.fs;
            const Platform = require('react-native').Platform;
            const fullUri = file.originalUri;
            
            const fileName = file.name || `report_${Date.now()}.${file.type}`;
            const cachePath = `${dirs.CacheDir}/${fileName}`;

            const res = await RNBlobUtil.config({
                fileCache: true,
                path: cachePath, // Save to cache first
                timeout: 30000,
            }).fetch('GET', fullUri, {
                Authorization: `Bearer ${token}`,
            });

            if (res.info().status === 200) {
                const path = res.path();
                const ext = fileName.split('.').pop()?.toLowerCase() || '';
                const isImg = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
                
                if (Platform.OS === 'android') {
                    const mimeMap: Record<string, string> = {
                        pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
                        png: 'image/png', gif: 'image/gif', webp: 'image/webp',
                    };

                    await RNBlobUtil.MediaCollection.copyToMediaStore(
                        {
                            name: fileName,
                            parentFolder: '',
                            mimeType: mimeMap[ext] || 'application/pdf' // Default to PDF for reports
                        },
                        isImg ? 'Image' : 'Download',
                        path
                    );
                    require('react-native').Alert.alert('Saved!', isImg ? 'Image saved to Gallery.' : 'Report saved to Downloads.');
                } else {
                    if (isImg) {
                        const { CameraRoll } = require('@react-native-camera-roll/camera-roll');
                        const fileUri = path.startsWith('file://') ? path : `file://${path}`;
                        await CameraRoll.saveAsset(fileUri, { type: 'photo' });
                        require('react-native').Alert.alert('Saved!', 'Image saved to Photos.');
                    } else {
                        // iOS: Use Share to allow 'Save to Files'
                        const { Share } = require('react-native');
                        const fileUri = path.startsWith('file://') ? path : `file://${path}`;
                        await Share.share({
                            url: fileUri,
                        });
                    }
                }
            } else {
                throw new Error('Download failed');
            }
        } catch (error) {
            console.error('Download error:', error);
            require('react-native').Alert.alert('Error', 'Failed to download report.');
        }
    };

    const handleView = (file: ReportFile) => {
        navigation.navigate('FileViewer', {
            file: {
                name: file.name,
                uri: file.uri, // Thumbnail (if available, likely null for reports)
                originalUri: file.originalUri,
                type: file.type, // Actual extension: pdf or html
            }
        });
    };

    const renderItem = ({ item }: { item: ReportFile }) => {
        const isExpanded = true;
        // const isExpanded = expandedId === item.id;

        return (
            <View className="mb-4 bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
                <TouchableOpacity 
                    onPress={() => toggleExpand(item.id)}
                    className="flex-row items-center p-5"
                >
                    <View className="w-12 h-12 rounded-full bg-[#FFF9C4] items-center justify-center mr-4">
                         {/* Circle Icon Placeholder */}
                    </View>
                    <View className="flex-1">
                        <Text className="text-text-primary font-bold text-base" numberOfLines={1}>{item.name}</Text>
                        <Text className="text-text-secondary text-xs mt-0.5">Submitted: {item.submitted}</Text>
                    </View>
                    {/* {isExpanded ? (
                        <ChevronDown size={20} color={colors['text-secondary']} />
                    ) : (
                        <ChevronRight size={20} color={colors['text-secondary']} />
                    )} */}
                </TouchableOpacity>

                
                    <View className="px-5 pb-6 pt-0">
                        <View className="h-[1px] bg-gray-100 mb-4 w-full" />
                        {/* <Text className="text-text-secondary text-sm leading-5 mb-6">
                            {item.description}
                        </Text> */}
                        
                        <View className="flex-row gap-4">
                            <TouchableOpacity
                                onPress={() => handleView(item)}
                                className="flex-1 bg-teal py-3 rounded-xl items-center justify-center shadow-sm active:opacity-90"
                            >
                                <Text className="text-white font-medium text-sm">View</Text>
                            </TouchableOpacity>
                            {/* Download disabled: reports are view-only inside the app */}
                            {/* <TouchableOpacity
                                onPress={() => handleDownload(item)}
                                className="flex-1 bg-teal py-3 rounded-xl items-center justify-center shadow-sm active:opacity-90"
                            >
                                <Text className="text-white font-medium text-sm">Download</Text>
                            </TouchableOpacity> */}
                        </View>
                    </View>
                 
            </View>
        );
    };

    return (
        <ScreenWrapper className="flex-1 bg-black/30" edges={['top', 'bottom']}>
            {/* 
                Simulating the Modal Look: 
                Since this is a screen, we create a centered card look or a full sheet.
                The design shows it centered with rounded corners on top of a dimmed background.
                We'll try to achieve a "Popup" feel.
            */}
            <View className="flex-1 justify-center px-4 py-8">
                <View className="bg-white rounded-[40px] flex-1 overflow-hidden shadow-2xl">
                    
                    {/* Header */}
                    <View className="px-6 py-6 flex-row items-center justify-between">
                        <Text className="text-2xl font-bold text-text-primary">Your Flahy Results</Text>
                        <TouchableOpacity 
                            onPress={() => navigation.goBack()}
                            className="p-2"
                        >
                            <X size={24} color={colors['text-primary']} />
                        </TouchableOpacity>
                    </View>

                    {isLoading ? (
                        <View className="flex-1 items-center justify-center">
                            <ActivityIndicator size="large" color={colors.primary} />
                        </View>
                    ) : (
                        <FlatList
                            data={reports}
                            renderItem={renderItem}
                            keyExtractor={item => item.id}
                            contentContainerStyle={{ padding: 24, paddingTop: 0, paddingBottom: 20 }}
                            showsVerticalScrollIndicator={false}
                            // ListHeaderComponent={
                            //     <MedicalDisclaimer variant="full" className="mb-4" />
                            // }
                            ListEmptyComponent={
                                <View className="py-10 items-center">
                                    <Text className="text-text-secondary">No reports found.</Text>
                                </View>
                            }
                        />
                    )}

                </View>
            </View>
        </ScreenWrapper>
    );
};
