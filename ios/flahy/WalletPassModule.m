#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (WalletPassModule, NSObject)

RCT_EXTERN_METHOD(canAddPasses:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(addPass:(NSString *)base64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
