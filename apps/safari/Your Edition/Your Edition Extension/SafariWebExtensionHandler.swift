//
//  SafariWebExtensionHandler.swift
//  Your Edition Extension
//
//  Answers browser.runtime.sendNativeMessage from the extension. The only
//  messages are for the on-device privacy filter (PrivacyFilter.swift):
//    { kind: "status" }                        → { ok, reason? }
//    { kind: "summarize", title, url, text }   → { ok, items: [{ link, title, summary }] } or { ok: false, reason }
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem
        let message = request?.userInfo?[SFExtensionMessageKey] as? [String: Any] ?? [:]

        Task {
            let reply = await Self.handle(message)
            let response = NSExtensionItem()
            response.userInfo = [SFExtensionMessageKey: reply]
            context.completeRequest(returningItems: [response], completionHandler: nil)
        }
    }

    private static func handle(_ message: [String: Any]) async -> [String: Any] {
        switch message["kind"] as? String {
        case "status":
            if let reason = PrivacyFilter.unavailableReason() { return ["ok": false, "reason": reason] }
            return ["ok": true]

        case "summarize":
            if let reason = PrivacyFilter.unavailableReason() { return ["ok": false, "reason": reason] }
            do {
                let items = try await PrivacyFilter.summarize(
                    title: message["title"] as? String ?? "",
                    url: message["url"] as? String ?? "",
                    text: message["text"] as? String ?? "")
                return ["ok": true, "items": items.map { ["link": $0.link, "title": $0.title, "summary": $0.summary] }]
            } catch {
                // Log the kind of failure only. Never log page text.
                os_log(.error, "Privacy filter failed: %{public}@", String(describing: type(of: error)))
                return ["ok": false, "reason": error.localizedDescription]
            }

        default:
            return ["ok": false, "reason": "unknown message"]
        }
    }
}
