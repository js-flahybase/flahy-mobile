import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { ArrowLeft, FileText, Share2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    PermissionsAndroid,
    Platform,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import FastImage from 'react-native-fast-image';
import Pdf from 'react-native-pdf';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

const { width, height } = Dimensions.get('window');

const getFullUrl = (uri: string) => {
    if (!uri) return '';
    if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;
    return `${API_BASE_URL}${uri.startsWith('/') ? '' : '/'}${uri}`;
};

const getMimeType = (ext: string) => {
    const map: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
    };
    return map[ext] || 'application/octet-stream';
};

export const FileViewerScreen = ({ route, navigation }: any) => {
    const { file } = route.params;
    const token = useAuthStore((s) => s.token);

    const fileExt = file.name?.split('.').pop()?.toLowerCase() || '';
    const isPdf = file.type?.toLowerCase().includes('pdf') || fileExt === 'pdf';
    const isHtml =
        !isPdf &&
        (file.type?.toLowerCase().includes('html') || ['html', 'htm'].includes(fileExt));
    const isImage =
        !isPdf &&
        !isHtml &&
        (file.type?.toLowerCase().includes('image') ||
            ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt));

    // Use originalUri (full-resolution original) for viewing/downloading, fall back to uri (thumbnail)
    const fullUri = getFullUrl(file.originalUri || file.uri);

    // Local cached path for the file (used for PDF viewing, sharing, and downloads)
    const [localPath, setLocalPath] = useState<string | null>(null);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pdfPageCount, setPdfPageCount] = useState(0);
    const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
    const [htmlContent, setHtmlContent] = useState<string | null>(null);

    // Download file to cache (for PDF viewing or later saving)
    const downloadToCache = useCallback(async (): Promise<string | null> => {
        try {
            const { dirs } = ReactNativeBlobUtil.fs;
            const fileName = file.name || `file_${Date.now()}.${fileExt || 'pdf'}`;
            const cachePath = `${dirs.CacheDir}/${fileName}`;

            console.log('[FileViewer] Downloading from:', fullUri);
            console.log('[FileViewer] Cache path:', cachePath);

            const res = await ReactNativeBlobUtil.config({
                fileCache: true,
                path: cachePath,
                timeout: 30000,
            }).fetch('GET', fullUri, {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            });

            const status = res.info().status;
            const path = res.path();
            console.log('[FileViewer] Download status:', status);

            if (status >= 200 && status < 300) {
                const exists = await ReactNativeBlobUtil.fs.exists(path);
                if (!exists) {
                    throw new Error('Downloaded file not found on disk');
                }
                return path; // raw path, no file:// prefix
            } else {
                throw new Error(`Server returned status ${status}`);
            }
        } catch (err: any) {
            console.error('[FileViewer] Download error:', err);
            throw err;
        }
    }, [fullUri, token, file.name, fileExt]);

    // On mount: download PDFs/HTML to cache for viewing
    useEffect(() => {
        if (isPdf) {
            loadPdf();
        } else if (isHtml) {
            loadHtml();
        }
    }, []);

    const loadPdf = async () => {
        setIsDownloading(true);
        setError(null);
        try {
            const path = await downloadToCache();
            if (path) {
                setLocalPath(path);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load PDF');
        } finally {
            setIsDownloading(false);
        }
    };

    const loadHtml = async () => {
        setIsDownloading(true);
        setError(null);
        try {
            const res = await ReactNativeBlobUtil.config({ timeout: 30000 }).fetch(
                'GET',
                fullUri,
                { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            );
            const status = res.info().status;
            if (status >= 200 && status < 300) {
                setHtmlContent(res.text());
            } else {
                throw new Error(`Server returned status ${status}`);
            }
        } catch (err: any) {
            console.error('[FileViewer] HTML load error:', err);
            setError(err.message || 'Failed to load HTML');
        } finally {
            setIsDownloading(false);
        }
    };

    // ============ DOWNLOAD / SAVE ============

    const requestStoragePermission = async () => {
        if (Platform.OS !== 'android') return true;
        // Android 10+ (API 29+) doesn't need WRITE_EXTERNAL_STORAGE for MediaStore
        const sdkInt = Platform.Version;
        if (typeof sdkInt === 'number' && sdkInt >= 29) return true;

        const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            {
                title: 'Storage Permission',
                message: 'App needs storage access to save files.',
                buttonPositive: 'Allow',
            },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
    };

    const handleSaveFile = async () => {
        if (isSaving) return;
        setIsSaving(true);

        try {
            const hasPermission = await requestStoragePermission();
            if (!hasPermission) {
                Alert.alert('Permission Denied', 'Storage permission is required to save files.');
                return;
            }

            // Step 1: get a local cached copy
            let cachedPath = localPath;
            if (!cachedPath) {
                cachedPath = await downloadToCache();
            }
            if (!cachedPath) {
                Alert.alert('Error', 'Could not download file.');
                return;
            }

            if (isImage) {
                // Save image to Photos/Gallery
                if (Platform.OS === 'android') {
                    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
                        {
                            name: file.name || `image_${Date.now()}.${fileExt}`,
                            parentFolder: '',
                            mimeType: getMimeType(fileExt),
                        },
                        'Image',
                        cachedPath,
                    );
                } else {
                    // iOS: save to camera roll
                    const fileUri = cachedPath.startsWith('file://') ? cachedPath : `file://${cachedPath}`;
                    await CameraRoll.saveAsset(fileUri, { type: 'photo' });
                }
                Alert.alert('Saved!', 'Image saved to your Photos.');
            } else {
                // Save PDF/other file to Downloads
                if (Platform.OS === 'android') {
                    await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
                        {
                            name: file.name || `file_${Date.now()}.${fileExt}`,
                            parentFolder: '',
                            mimeType: getMimeType(fileExt),
                        },
                        'Download',
                        cachedPath,
                    );
                    Alert.alert('Saved!', 'File saved to Downloads.');
                } else {
                    // iOS: Use Share to allow 'Save to Files'
                    const cleanPath = cachedPath.startsWith('file://') ? cachedPath : `file://${cachedPath}`;
                    await Share.share({
                        url: cleanPath,
                    });
                }
            }
        } catch (err: any) {
            console.error('[FileViewer] Save error:', err);
            Alert.alert('Error', err.message || 'Failed to save file.');
        } finally {
            setIsSaving(false);
        }
    };

    // ============ SHARE ============

    const handleShare = async () => {
        try {
            let cachedPath = localPath;
            if (!cachedPath) {
                cachedPath = await downloadToCache();
            }
            if (!cachedPath) {
                Alert.alert('Error', 'Could not download file for sharing.');
                return;
            }
            const fileUri = cachedPath.startsWith('file://') ? cachedPath : `file://${cachedPath}`;
            await Share.share({
                url: fileUri,
                title: file.name,
            });
        } catch (err: any) {
            console.error('[FileViewer] Share error:', err);
        }
    };

    // ============ RENDER CONTENT ============

    const renderContent = () => {
        // ---- IMAGE ----
        if (isImage) {
            return (
                <View style={{ flex: 1, width }}>
                    {imageLoading && (
                        <View style={[s.centered, StyleSheet.absoluteFill, { zIndex: 1 }]}>
                            <ActivityIndicator size="large" color={colors.primary} />
                            <Text style={s.loadingText}>Loading image...</Text>
                        </View>
                    )}
                    {error ? (
                        <View style={s.centered}>
                            <View style={s.errorIcon}>
                                <FileText size={40} color={colors['text-secondary']} />
                            </View>
                            <Text style={s.errorTitle}>Unable to load image</Text>
                            <Text style={s.errorSub}>{error}</Text>
                            <TouchableOpacity
                                style={s.retryBtn}
                                onPress={() => {
                                    setError(null);
                                    setImageLoading(true);
                                }}>
                                <Text style={s.retryText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <FastImage
                            source={{
                                uri: fullUri,
                                headers: token ? { Authorization: `Bearer ${token}` } : {},
                                priority: FastImage.priority.high,
                            }}
                            style={{ width, height: height * 0.8 }}
                            resizeMode={FastImage.resizeMode.contain}
                            onLoadEnd={() => setImageLoading(false)}
                            onError={() => {
                                setImageLoading(false);
                                setError('Failed to load image.');
                            }}
                        />
                    )}
                </View>
            );
        }

        // ---- HTML: render ----
        if (isHtml) {
            if (isDownloading) {
                return (
                    <View style={s.centered}>
                        <ActivityIndicator size="large" color={colors.primary} />
                        <Text style={s.loadingText}>Loading report...</Text>
                    </View>
                );
            }
            if (error || !htmlContent) {
                return (
                    <View style={s.centered}>
                        <View style={s.errorIcon}>
                            <FileText size={40} color={colors['text-secondary']} />
                        </View>
                        <Text style={s.errorTitle}>Unable to load file</Text>
                        <Text style={s.errorSub}>{error || 'Something went wrong.'}</Text>
                        <TouchableOpacity style={s.retryBtn} onPress={loadHtml}>
                            <Text style={s.retryText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                );
            }
            return (
                <View style={{ flex: 1, width, backgroundColor: 'white' }}>
                    <WebView
                        originWhitelist={['*']}
                        source={{ html: htmlContent, baseUrl: fullUri }}
                        style={{ flex: 1, backgroundColor: 'white' }}
                        javaScriptEnabled
                        domStorageEnabled
                    />
                </View>
            );
        }

        // ---- PDF: loading state ----
        if (isDownloading) {
            return (
                <View style={s.centered}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={s.loadingText}>Loading PDF...</Text>
                </View>
            );
        }

        // ---- PDF: error or no local path ----
        if (error || !localPath) {
            return (
                <View style={s.centered}>
                    <View style={s.errorIcon}>
                        <FileText size={40} color={colors['text-secondary']} />
                    </View>
                    <Text style={s.errorTitle}>Unable to load file</Text>
                    <Text style={s.errorSub}>{error || 'Something went wrong.'}</Text>
                    <TouchableOpacity style={s.retryBtn} onPress={loadPdf}>
                        <Text style={s.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        // ---- PDF: render ----
        if (isPdf) {
            const pdfSource = {
                uri: localPath.startsWith('file://') ? localPath : `file://${localPath}`,
                cache: true,
            };

            return (
                <View style={{ flex: 1, width }}>
                    <Pdf
                        source={pdfSource}
                        style={{ flex: 1, width, backgroundColor: '#222' }}
                        trustAllCerts={false}
                        onLoadComplete={(numberOfPages) => {
                            console.log('[FileViewer] PDF loaded, pages:', numberOfPages);
                            setPdfPageCount(numberOfPages);
                        }}
                        onPageChanged={(page) => {
                            setPdfCurrentPage(page);
                        }}
                        onError={(err) => {
                            console.error('[FileViewer] PDF render error:', err);
                            setError('Failed to render PDF.');
                        }}
                        enablePaging={false}
                        spacing={8}
                    />
                    {pdfPageCount > 0 && (
                        <View style={s.pageIndicator}>
                            <Text style={s.pageText}>
                                {pdfCurrentPage} / {pdfPageCount}
                            </Text>
                        </View>
                    )}
                </View>
            );
        }

        // ---- Fallback: unsupported format ----
        return (
            <View style={s.centered}>
                <View style={s.errorIcon}>
                    <FileText size={40} color={colors['text-secondary']} />
                </View>
                <Text style={s.errorTitle}>Preview not available</Text>
                <Text style={s.errorSub}>
                    This file format ({fileExt}) cannot be previewed in-app.
                </Text>
                <TouchableOpacity style={s.retryBtn} onPress={handleSaveFile}>
                    <Text style={s.retryText}>Download File</Text>
                </TouchableOpacity>
            </View>
        );
    };

    return (
        <SafeAreaView style={s.container} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.headerBtn}>
                    <ArrowLeft size={22} color="white" />
                </TouchableOpacity>

                <Text style={s.headerTitle} numberOfLines={1}>
                    {file.name}
                </Text>

                <View style={s.headerActions}>
                    <TouchableOpacity onPress={handleShare} style={s.headerBtn} accessibilityLabel="Share">
                        <Share2 size={18} color="white" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Content */}
            <View style={s.content}>{renderContent()}</View>
        </SafeAreaView>
    );
};

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#111',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    headerBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
    },
    headerTitle: {
        flex: 1,
        color: 'white',
        fontWeight: '500',
        fontSize: 15,
        textAlign: 'center',
        marginHorizontal: 12,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#222',
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    loadingText: {
        color: '#999',
        fontSize: 14,
        marginTop: 16,
    },
    errorIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    errorTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 8,
    },
    errorSub: {
        color: '#999',
        fontSize: 14,
        textAlign: 'center',
        marginBottom: 24,
    },
    retryBtn: {
        backgroundColor: colors.teal,
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: 12,
    },
    retryText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
    },
    pageIndicator: {
        position: 'absolute',
        bottom: 16,
        alignSelf: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 16,
    },
    pageText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '500',
    },
});
