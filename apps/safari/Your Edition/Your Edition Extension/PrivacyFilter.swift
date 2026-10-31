//
//  PrivacyFilter.swift
//  Your Edition Extension
//
//  The on-device privacy filter. The extension sends each chunk of a scraped
//  page here before anything is uploaded. Apple's on-device model (Foundation
//  Models) lists the items worth reading, in its own words, and leaves out
//  personal details. Only that list leaves the Mac. See lib/privacy-filter.ts.
//

import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

enum PrivacyFilter {

    /// Why the filter can't run on this Mac, or nil when it can.
    static func unavailableReason() -> String? {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            switch SystemLanguageModel.default.availability {
            case .available:
                return nil
            case .unavailable(.deviceNotEligible):
                return "this Mac can't run Apple Intelligence"
            case .unavailable(.appleIntelligenceNotEnabled):
                return "Apple Intelligence is turned off in System Settings"
            case .unavailable(.modelNotReady):
                return "the Apple Intelligence model is still downloading"
            case .unavailable(let other):
                return "the on-device model is unavailable (\(other))"
            }
        }
        #endif
        return "the on-device model needs macOS 26 or later"
    }

    /// One item the model picked out of a chunk. `link` is the [n] marker it came from.
    struct Item {
        let link: Int
        let title: String
        let summary: String
    }

    /// List the items worth reading in one chunk of page text.
    static func summarize(title: String, url: String, text: String) async throws -> [Item] {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, *) {
            let session = LanguageModelSession(instructions: instructions)
            let prompt = "Page: \(title)\nAddress: \(url)\n\nText:\n\(text)"
            let page = try await session.respond(to: prompt, generating: FilteredPage.self).content
            return page.items.map { Item(link: $0.link, title: $0.title, summary: $0.summary) }
        }
        #endif
        throw FilterError.unavailable(unavailableReason() ?? "unavailable")
    }

    enum FilterError: LocalizedError {
        case unavailable(String)
        var errorDescription: String? {
            switch self {
            case .unavailable(let reason): return reason
            }
        }
    }

    private static let instructions = """
        You read one part of a web page that the user opened while signed in. \
        List the stories, posts, videos and other items on it that are worth reading. \
        Each link in the text has a number in square brackets, such as [3]. \
        For each item, give the number of its link. Use only numbers that are in the text. \
        Write the title and the summary in your own words. Do not copy long passages. \
        Never include personal details: names of private people, email addresses, \
        phone numbers, street addresses, account, order or card numbers, balances, \
        or the contents of messages to the user. \
        If the text has nothing worth reading, return no items.
        """
}

#if canImport(FoundationModels)
@available(macOS 26.0, *)
@Generable
struct FilteredItem {
    @Guide(description: "The number in square brackets of the link for this item")
    var link: Int
    @Guide(description: "A short headline in your own words, at most 12 words")
    var title: String
    @Guide(description: "One sentence on why it is worth reading, with no personal details")
    var summary: String
}

@available(macOS 26.0, *)
@Generable
struct FilteredPage {
    @Guide(description: "The items worth reading", .maximumCount(15))
    var items: [FilteredItem]
}
#endif
