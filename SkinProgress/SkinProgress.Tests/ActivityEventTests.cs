using Microsoft.VisualStudio.TestTools.UnitTesting;
using SkinProgress.Models;

namespace SkinProgress.Tests;

[TestClass]
public class ActivityEventTests
{
    [TestMethod]
    public void QuestLockInEvent_ToText_ContainsAllHabitNames()
    {
        var evt = new QuestLockInEvent
        {
            HabitNames = ["Cleanse", "Hydrate", "SPF"],
            Timestamp = new DateTime(2026, 5, 29, 20, 0, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "May 29 2026");
        StringAssert.Contains(text, "Cleanse");
        StringAssert.Contains(text, "Hydrate");
        StringAssert.Contains(text, "SPF");
    }

    [TestMethod]
    public void SelfieTakenEvent_ToText_ContainsDateAndTime()
    {
        var evt = new SelfieTakenEvent
        {
            PhotoId = Guid.NewGuid(),
            CaptureAngles = ["front", "left", "right"],
            Timestamp = new DateTime(2026, 5, 29, 10, 30, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "May 29 2026");
        StringAssert.Contains(text, "10:30");
    }

    [TestMethod]
    public void SelfieAnalyzedEvent_ToText_WithPreviousAnalysis_IncludesDelta()
    {
        var evt = new SelfieAnalyzedEvent
        {
            AnalysisId = Guid.NewGuid(),
            AcneSeverity = 4,
            RednessSeverity = 3,
            UnderEyeBagsSeverity = 2,
            PreviousAcneSeverity = 5,
            Timestamp = new DateTime(2026, 5, 29, 10, 32, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "4/10");
        StringAssert.Contains(text, "3/10");
        StringAssert.Contains(text, "improved");
        StringAssert.Contains(text, "20%");
    }

    [TestMethod]
    public void SelfieAnalyzedEvent_ToText_WithoutPreviousAnalysis_OmitsDelta()
    {
        var evt = new SelfieAnalyzedEvent
        {
            AnalysisId = Guid.NewGuid(),
            AcneSeverity = 4,
            RednessSeverity = 3,
            UnderEyeBagsSeverity = 2,
            PreviousAcneSeverity = null,
            Timestamp = new DateTime(2026, 5, 29, 10, 32, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "4/10");
        Assert.IsFalse(text.Contains("improved") || text.Contains("worsened"),
            "Delta sentence should be omitted when no prior analysis");
    }

    [TestMethod]
    public void SelfieAnalyzedEvent_ToText_WithZeroPreviousScore_OmitsDelta()
    {
        var evt = new SelfieAnalyzedEvent
        {
            AnalysisId = Guid.NewGuid(),
            AcneSeverity = 4,
            RednessSeverity = 3,
            UnderEyeBagsSeverity = 2,
            PreviousAcneSeverity = 0,
            Timestamp = new DateTime(2026, 5, 29, 10, 32, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        Assert.IsFalse(text.Contains("improved") || text.Contains("worsened"),
            "Delta omitted when previous score is 0 (division-by-zero prevention)");
    }

    [TestMethod]
    public void RecommendationsGivenEvent_ToText_ContainsTitles()
    {
        var evt = new RecommendationsGivenEvent
        {
            RecommendationTitles = ["Maintain routine", "Use niacinamide"],
            RecommendationCategories = ["skincare", "skincare"],
            LinkedAnalysisId = Guid.NewGuid().ToString(),
            Timestamp = new DateTime(2026, 5, 29, 10, 33, 0, DateTimeKind.Utc)
        };

        var text = evt.ToText();

        StringAssert.Contains(text, "May 29 2026");
        StringAssert.Contains(text, "maintain routine");
        StringAssert.Contains(text, "use niacinamide");
    }

    [TestMethod]
    public void AllEvents_EventType_MatchesSpec()
    {
        Assert.AreEqual("daily_quest_lock_in",
            new QuestLockInEvent { HabitNames = [], Timestamp = DateTime.UtcNow }.EventType);
        Assert.AreEqual("selfie_taken",
            new SelfieTakenEvent { PhotoId = Guid.NewGuid(), CaptureAngles = [], Timestamp = DateTime.UtcNow }.EventType);
        Assert.AreEqual("selfie_analyzed",
            new SelfieAnalyzedEvent { AnalysisId = Guid.NewGuid(), AcneSeverity = 0, RednessSeverity = 0, UnderEyeBagsSeverity = 0, Timestamp = DateTime.UtcNow }.EventType);
        Assert.AreEqual("recommendations_given",
            new RecommendationsGivenEvent { RecommendationTitles = [], RecommendationCategories = [], LinkedAnalysisId = "", Timestamp = DateTime.UtcNow }.EventType);
    }

    [TestMethod]
    public void SelfieAnalyzedEvent_ToMetadata_ContainsAllScores()
    {
        var id = Guid.NewGuid();
        var evt = new SelfieAnalyzedEvent
        {
            AnalysisId = id,
            AcneSeverity = 4,
            RednessSeverity = 3,
            UnderEyeBagsSeverity = 2,
            Timestamp = DateTime.UtcNow
        };

        var meta = evt.ToMetadata();

        Assert.AreEqual(id.ToString(), meta["analysis_id"]);
        Assert.AreEqual(4, meta["acne_severity"]);
        Assert.AreEqual(3, meta["redness_severity"]);
        Assert.AreEqual(2, meta["under_eye_bags_severity"]);
    }
}
