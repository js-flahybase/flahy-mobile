import { useNavigation } from '@react-navigation/native';
import { LogOut } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { ScreenWrapper } from '../components/ScreenWrapper';
import { WEB_APP_URL } from '../config';
import { Product, productService } from '../services/productService';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/colors';

// Local mapping for product images
const IMAGE_MAP: Record<string, any> = {
    'flahylife': require('../assets/products/flahylife.png'),
    'flahyclarity': require('../assets/products/flahyclarity.webp'),
    'flahyneuro': require('../assets/products/flahyneuro.png'),
};

// Fallback image (using flahylife as default if slug matches nothing, though we filter specifically)
const DEFAULT_IMAGE = require('../assets/products/flahylife.png');

export const SupplementScreen = () => {
    const navigation = useNavigation();
    const { logout } = useAuthStore();
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        try {
            const list = await productService.getAllProducts();
            // The list endpoint only gives id, name, slug. 
            // We need to fetch details for description and price.
            // Since there are few products, we can fetch them in parallel.
            const detailedProducts = await Promise.all(
                list.map(async (p) => {
                    try {
                        const details = await productService.getProductBySlug(p.slug);
                        return { ...p, ...details };
                    } catch (err) {
                        console.error(`Failed to fetch details for ${p.slug}`, err);
                        return p;
                    }
                })
            );
            // Filter out any that failed completely if needed, or just set what we have
            const allowedSlugs = ['flahylife', 'flahyclarity', 'flahyneuro'];
            const filteredProducts = detailedProducts.filter(p => allowedSlugs.includes(p.slug.toLowerCase()));
            setProducts(filteredProducts);
        } catch (error) {
            console.error("Failed to fetch products", error);
        } finally {
            setLoading(false);
        }
    };

    const renderProduct = ({ item }: { item: Product }) => {
        console.log("🚀 ~ renderProduct ~ item:", item)
        // Format price
        const priceDisplay = item.amount 
            ? `Price:    ₹${(item.amount / 100).toLocaleString()}` // Assuming amount is in lowest denomination (e.g. paise) if from Stripe/Razorpay, 
                                                                    // BUT Postman example says: amount: 1550000. 
                                                                    // Let's assume user wants raw value or it needs division. 
                                                                    // Wait, 1550000 INR? That's huge. 
                                                                    // Example also says "product_amount": "1313500". 
                                                                    // Let's check the logic. 
                                                                    // If mock was 9500, maybe 1550000 is actually 15500.00? or 15,500?
                                                                    // Postman: "amount": 1550000 -> 15,500.00 if /100.
                                                                    // "product_amount": "1313500".
                                                                    // I'll display formatted amount. I'll guess /100 for now based on common API patterns (cents/paise).
            : 'Price:    ₹ --';

        // Actually if postman response is 1550000 and MOCK was 9500, 
        // 1,550,000 / 100 = 15,500. Matches range.
        
        return (
            <View className="bg-white rounded-[30px] mb-8 overflow-hidden shadow-sm border border-gray-100 mx-4 elevation-3">
                {/* Image Container */}
                <View className="h-64 bg-gray-50 items-center justify-center p-4">
                    <Image
                        source={IMAGE_MAP[item.slug.toLowerCase()] || DEFAULT_IMAGE}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                    />
                </View>

                <View className="p-5 pt-4">
                    <Text className="text-text-primary font-bold text-xl mb-2">{item.name}</Text>

                    {item.description ? (
                        <Text className="text-sm leading-5 mb-4 text-[#666666]" numberOfLines={3}>
                            {item.description}
                        </Text>
                    ) : null}

                    <Text className="text-text-primary font-bold text-xl mb-6">
                        {item.product_amount
                            ? `₹${(parseFloat(item.product_amount) / 100).toLocaleString()}`
                            : (item.amount ? `₹${(item.amount / 100).toLocaleString()}` : '₹ --')
                        }
                    </Text>

                    <TouchableOpacity
                        className="bg-[#4FB5B0] py-4 rounded-xl items-center shadow-sm active:opacity-90"
                        onPress={() => {
                            const productUrl = `${WEB_APP_URL}/${item.slug}`;
                            Linking.openURL(productUrl).catch((err: any) => console.error("Couldn't load page", err));
                        }}
                    >
                        <Text className="text-white text-lg font-medium">Click to order</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#FFFBE6', justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <ScreenWrapper className="flex-1 bg-[#FFFBE6]">
                 
                {/* Custom Header */}
                <View className="px-6 pt-2 pb-6 items-center relative">

                    {/* Logout Button */}
                    <TouchableOpacity
                        onPress={logout}
                        className="absolute right-6 top-4 z-10 p-2"
                    >
                        <LogOut size={22} color="#EF4444" />
                    </TouchableOpacity>

                    {/* Logo Area */}
                    <View className="flex-row items-center mb-6 mt-4">
                        <Image 
                            source={require('../assets/flahy_icon.png')} 
                            className="w-8 h-8 mr-2"
                            resizeMode="contain"
                        />
                        <Text className="text-[#2F2F2F] text-2xl font-bold tracking-widest">FLAHY</Text>
                    </View>

                    {/* Tagline */}
                    <Text className="text-black text-base font-bold text-center leading-6 max-w-[80%]">
                        Please Order From the Below to Begin Your Health Journey
                    </Text>
                </View>

                {/* White Container for List - rounded top */}
                <View className="flex-1 bg-white rounded-t-[40px] pt-10 shadow-sm overflow-hidden">
                    <FlatList 
                        data={products}
                        renderItem={renderProduct}
                        keyExtractor={item => item.id}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40, paddingTop: 10 }}
                    />
                </View>

         </ScreenWrapper>
    );
};
