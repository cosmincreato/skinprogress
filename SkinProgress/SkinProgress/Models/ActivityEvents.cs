namespace SkinProgress.Models;

public abstract class ActivityEvent
{
    public required DateTime Timestamp { get; init; }
    public abstract string EventType { get; }
    public abstract string ToText();
    public abstract Dictionary<string, object> ToMetadata();
}

public class QuestLockInEvent : ActivityEvent
{
    public required string[] HabitNames { get; init; }

    public override string EventType => "daily_quest_lock_in";

    public override string ToText() =>
        $"User locked in their daily quest on {Timestamp.ToString("MMMM d yyyy", System.Globalization.CultureInfo.GetCultureInfo("en-US"))}. " +
        $"Habits completed and permanently locked: {string.Join(", ", HabitNames)}.";

    public override Dictionary<string, object> ToMetadata() => new()
    {
        ["quest_date"] = Timestamp.ToString("yyyy-MM-dd"),
        ["habit_names"] = HabitNames,
        ["locked_habit_count"] = HabitNames.Length
    };
}

public class SelfieTakenEvent : ActivityEvent
{
    public required Guid PhotoId { get; init; }
    public required string[] CaptureAngles { get; init; }

    public override string EventType => "selfie_taken";

    public override string ToText() =>
        $"User took a selfie set on {Timestamp.ToString("MMMM d yyyy", System.Globalization.CultureInfo.GetCultureInfo("en-US"))} at {Timestamp:h:mm tt}.";

    public override Dictionary<string, object> ToMetadata() => new()
    {
        ["photo_id"] = PhotoId.ToString(),
        ["capture_angles"] = CaptureAngles,
        ["capture_angle_count"] = CaptureAngles.Length
    };
}

public class SelfieAnalyzedEvent : ActivityEvent
{
    public required Guid AnalysisId { get; init; }
    public required int AcneSeverity { get; init; }
    public required int RednessSeverity { get; init; }
    public required int UnderEyeBagsSeverity { get; init; }
    public int? ForeheadSeverity { get; init; }
    public int? LeftCheekSeverity { get; init; }
    public int? RightCheekSeverity { get; init; }
    public int? ChinSeverity { get; init; }
    public int? NoseSeverity { get; init; }
    public int? PreviousAcneSeverity { get; init; }

    public override string EventType => "selfie_analyzed";

    public override string ToText()
    {
        var text = $"User's skin was analyzed on {Timestamp.ToString("MMMM d yyyy", System.Globalization.CultureInfo.GetCultureInfo("en-US"))}. " +
                   $"Acne severity {AcneSeverity}/10, redness {RednessSeverity}/10, " +
                   $"under-eye bags {UnderEyeBagsSeverity}/10.";

        if (PreviousAcneSeverity.HasValue && PreviousAcneSeverity.Value > 0)
        {
            var deltaPct = ((AcneSeverity - PreviousAcneSeverity.Value) / (double)PreviousAcneSeverity.Value) * 100;
            var direction = deltaPct < 0 ? "improved" : "worsened";
            text += $" Acne {direction} {Math.Abs(deltaPct):F0}% vs the previous analysis.";
        }

        return text;
    }

    public override Dictionary<string, object> ToMetadata() => new()
    {
        ["analysis_id"] = AnalysisId.ToString(),
        ["acne_severity"] = AcneSeverity,
        ["redness_severity"] = RednessSeverity,
        ["under_eye_bags_severity"] = UnderEyeBagsSeverity,
        ["forehead_severity"] = ForeheadSeverity ?? 0,
        ["left_cheek_severity"] = LeftCheekSeverity ?? 0,
        ["right_cheek_severity"] = RightCheekSeverity ?? 0,
        ["chin_severity"] = ChinSeverity ?? 0,
        ["nose_severity"] = NoseSeverity ?? 0
    };
}

public class RecommendationsGivenEvent : ActivityEvent
{
    public required string[] RecommendationTitles { get; init; }
    public required string[] RecommendationCategories { get; init; }
    public required string LinkedAnalysisId { get; init; }

    public override string EventType => "recommendations_given";

    public override string ToText()
    {
        var titles = string.Join(", ", RecommendationTitles.Take(3).Select(t => t.ToLower()));
        return $"New skincare recommendations given on {Timestamp.ToString("MMMM d yyyy", System.Globalization.CultureInfo.GetCultureInfo("en-US"))}: {titles}.";
    }

    public override Dictionary<string, object> ToMetadata() => new()
    {
        ["recommendation_titles"] = RecommendationTitles,
        ["recommendation_categories"] = RecommendationCategories,
        ["recommendation_count"] = RecommendationTitles.Length,
        ["linked_analysis_id"] = LinkedAnalysisId
    };
}
