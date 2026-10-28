import Foundation
import PassKit
import React

/// Presents the system "Add to Apple Wallet" sheet for a base64 encoded .pkpass.
@objc(WalletPassModule)
class WalletPassModule: NSObject, PKAddPassesViewControllerDelegate {
  private var resolve: RCTPromiseResolveBlock?

  @objc static func requiresMainQueueSetup() -> Bool { true }

  @objc(canAddPasses:rejecter:)
  func canAddPasses(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(PKAddPassesViewController.canAddPasses())
  }

  /// Resolves `true` once the sheet is dismissed. The system doesn't say whether the
  /// user tapped Add or Cancel, so callers should not treat this as "pass added".
  @objc(addPass:resolver:rejecter:)
  func addPass(
    _ base64: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard PKAddPassesViewController.canAddPasses() else {
      reject("E_WALLET_UNAVAILABLE", "Apple Wallet is not available on this device.", nil)
      return
    }
    guard let data = Data(base64Encoded: base64, options: .ignoreUnknownCharacters) else {
      reject("E_INVALID_PASS", "The pass data is not valid base64.", nil)
      return
    }
    let pass: PKPass
    do {
      pass = try PKPass(data: data)
    } catch {
      reject("E_INVALID_PASS", "The pass is invalid or not signed correctly.", error)
      return
    }

    DispatchQueue.main.async {
      guard let controller = PKAddPassesViewController(pass: pass),
            let presenter = Self.topViewController() else {
        reject("E_PRESENT_FAILED", "Could not show the Apple Wallet sheet.", nil)
        return
      }
      self.resolve = resolve
      controller.delegate = self
      presenter.present(controller, animated: true)
    }
  }

  func addPassesViewControllerDidFinish(_ controller: PKAddPassesViewController) {
    controller.dismiss(animated: true) {
      self.resolve?(true)
      self.resolve = nil
    }
  }

  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    var top = scene?.windows.first(where: { $0.isKeyWindow })?.rootViewController
    while let presented = top?.presentedViewController {
      top = presented
    }
    return top
  }
}
