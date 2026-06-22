import React, { useState } from "react";
import html2pdf from "html2pdf.js";
import { getAuthToken } from "../../services/authService";

/**
 * ExportReportButton Component
 *
 * SOLID Principles:
 * - Single Responsibility: Handles only PDF generation and download
 * - Dependency Inversion: Receives data as props, client-side PDF generation with pdfkit
 * - Interface Segregation: Minimal required props
 * - Open/Closed: Extensible for different report formats (CSV, etc.)
 *
 * Performance Target: < 10 seconds to generate and download (SC-003)
 *
 * Features:
 * - Generate PDF with trend graphs embedded
 * - Include user information and date range
 * - Client-side generation (no server dependency)
 * - Fallback to server-side generation if needed
 *
 * TODO: Install pdfkit for client-side PDF generation
 * npm install pdfkit @types/pdfkit
 *
 * Future Enhancement: Server-side generation via /api/reports/export
 */

export interface ExportReportButtonProps {
  dateRangeStart: Date;
  dateRangeEnd: Date;
  userName?: string;
  isDisabled?: boolean;
  onExportStart?: () => void;
  onExportComplete?: (success: boolean, fileName?: string) => void;
}

/**
 * ExportReportButton Component
 *
 * Generates and downloads a PDF report with:
 * - Header with user info and date range
 * - Summary statistics
 * - Trend graphs as images
 * - Recommendations based on trends
 */
export const ExportReportButton: React.FC<ExportReportButtonProps> = ({
  dateRangeStart,
  dateRangeEnd,
  isDisabled = false,
  onExportStart,
  onExportComplete,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Format date for display
   */
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  /**
   * Generate PDF report
   *
   * Strategy:
   * 1. Client-side generation with pdfkit (lightweight, fast)
   * 2. Fallback to server-side API call if client generation fails
   * 3. Show progress feedback during generation
   */
  const handleExport = async () => {
    setIsExporting(true);
    setError(null);

    try {
      onExportStart?.();

      // Step 1: Try client-side generation with pdfkit
      // TODO: Replace with actual pdfkit implementation once installed
      //
      // const PDFDocument = require('pdfkit');
      // const doc = new PDFDocument();
      //
      // // Add header
      // doc.fontSize(24).text('Skin Progress Evolution Report', 100, 100);
      // doc.fontSize(12).text(`Generated for ${userName}`, 100, 140);
      // doc.fontSize(10).text(`Period: ${formatDate(dateRangeStart)} to ${formatDate(dateRangeEnd)}`, 100, 160);
      //
      // // Add date range info
      // doc.moveTo(100, 170).lineTo(500, 170).stroke();
      //
      // // Add summary statistics
      // doc.fontSize(16).text('Summary Statistics', 100, 190);
      // doc.fontSize(11).text('Average Severity: [TO BE CALCULATED]', 100, 215);
      // doc.fontSize(11).text('Trend: [TO BE CALCULATED]', 100, 235);
      //
      // // TODO: Add embedded charts/graphs
      //
      // // Stream to blob
      // const chunks: any[] = [];
      // doc.on('data', (chunk: any) => chunks.push(chunk));
      // doc.on('end', () => {
      //   const blob = new Blob(chunks, { type: 'application/pdf' });
      //   downloadPDF(blob, `skin-progress-${formatDate(dateRangeStart)}.pdf`);
      //   setIsExporting(false);
      //   onExportComplete?.(true);
      // });
      // doc.end();

      // For now, use server-side generation (Step 2 fallback)
      await generateReportServerSide();

      setIsExporting(false);
      onExportComplete?.(true);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to generate report";
      setError(errorMsg);
      setIsExporting(false);
      onExportComplete?.(false);
    }
  };

  const generateReportServerSide = async () => {
    const token = getAuthToken();
    const response = await fetch("/api/evolution/export-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        dateRangeStart: dateRangeStart.toISOString().split("T")[0],
        dateRangeEnd: dateRangeEnd.toISOString().split("T")[0],
      }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }

    const html = await response.text();
    const fileName = `skin-progress-${formatDate(dateRangeStart)}-to-${formatDate(dateRangeEnd)}.pdf`;

    // DOMParser reliably separates <style> and body content from a full HTML document.
    // Passing the raw string via innerHTML strips structural tags unpredictably.
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const styles = Array.from(parsed.querySelectorAll("style"))
      .map((s) => s.outerHTML)
      .join("");
    const fragment = `<div style="font-family:Arial,sans-serif;padding:20px;background:#fff;">${styles}${parsed.body.innerHTML}</div>`;

    await html2pdf()
      .set({
        margin: 10,
        filename: fileName,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(fragment)
      .save();
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        onClick={handleExport}
        disabled={isDisabled || isExporting}
        className={`inline-flex items-center gap-2 px-6 py-3 text-white font-semibold rounded-lg transition-all ${
          isDisabled || isExporting
            ? "bg-slate-400 cursor-not-allowed"
            : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 active:scale-95"
        }`}
        aria-label={
          isExporting
            ? "Generating PDF report in progress"
            : "Generate and download skin progress report as PDF"
        }
        aria-busy={isExporting}
        title={
          isDisabled
            ? "No data available to export"
            : "Generate a PDF report with your skin evolution data"
        }
      >
        {isExporting ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Generating PDF...
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Export PDF Report
          </>
        )}
      </button>

      {/* Error Message */}
      {error && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 w-full"
          role="alert"
          aria-live="polite"
        >
          <p className="font-medium">Export Failed</p>
          <p className="text-xs mt-1">{error}</p>
          <p className="text-xs mt-2 text-red-600">
            Tip: Make sure you have at least 7 days of selfie data for a
            complete report.
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700 w-full">
        <p className="font-medium flex items-center gap-2">
          <svg
            className="h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <circle cx="12" cy="12" r="10" />
            <text
              x="12"
              y="16"
              fontSize="14"
              textAnchor="middle"
              fill="white"
              fontWeight="bold"
            >
              i
            </text>
          </svg>
          Report Details
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          <li>✓ Includes trend graphs and statistics</li>
          <li>
            ✓ Period: {formatDate(dateRangeStart)} to {formatDate(dateRangeEnd)}
          </li>
          <li>✓ Generated with your latest analysis data</li>
          <li>✓ Suitable for sharing with dermatologists</li>
        </ul>
      </div>

      {/* Accessibility Info */}
      <div className="text-xs text-slate-600">
        <p>Estimated generation time: &lt;10 seconds</p>
        <p>File format: PDF | Size: ~2-5 MB</p>
      </div>
    </div>
  );
};

export default ExportReportButton;
