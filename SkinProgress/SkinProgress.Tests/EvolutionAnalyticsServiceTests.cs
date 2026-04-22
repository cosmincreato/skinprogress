using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using SkinProgress.Data;
using SkinProgress.Models.DTOs;
using SkinProgress.Models.Entities;
using SkinProgress.Services;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace SkinProgress.Tests
{
    [TestClass]
    public class EvolutionAnalyticsServiceTests
    {
        /// <summary>
        /// NOTE: Full unit tests require DbContext mocking which is complex with EF Core async operations.
        /// Recommended approach: Integration tests against test database or in-memory SQLite.
        /// 
        /// This test file demonstrates the test structure and key test cases.
        /// For production: Use SQLite in-memory provider with DbContextOptionsBuilder
        /// </summary>

        [TestMethod]
        public void ServiceCanBeInstantiated()
        {
            // Arrange
            var mockDbContext = new Mock<AppDbContext>();
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();

            // Act
            var service = new EvolutionAnalyticsService(mockDbContext.Object, mockLogger.Object);

            // Assert
            Assert.IsNotNull(service);
        }

        [TestMethod]
        [ExpectedException(typeof(ArgumentNullException))]
        public void ServiceThrowsIfDbContextIsNull()
        {
            // Arrange & Act
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();
            var service = new EvolutionAnalyticsService(null, mockLogger.Object);

            // Assert - Exception thrown
        }

        [TestMethod]
        [ExpectedException(typeof(ArgumentNullException))]
        public void ServiceThrowsIfLoggerIsNull()
        {
            // Arrange & Act
            var mockDbContext = new Mock<AppDbContext>();
            var service = new EvolutionAnalyticsService(mockDbContext.Object, null);

            // Assert - Exception thrown
        }

        [TestMethod]
        public async Task GetAnalysisHistoryAsync_ThrowsOnNullUserId()
        {
            // Arrange
            var mockDbContext = new Mock<AppDbContext>();
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();
            var service = new EvolutionAnalyticsService(mockDbContext.Object, mockLogger.Object);

            // Act & Assert
            var exception = await Assert.ThrowsExceptionAsync<ArgumentException>(
                () => service.GetAnalysisHistoryAsync(null, DateTime.UtcNow.AddDays(-30), DateTime.UtcNow));

            Assert.IsNotNull(exception);
        }

        [TestMethod]
        public async Task GetAnalysisHistoryAsync_ThrowsOnInvalidDateRange()
        {
            // Arrange
            var mockDbContext = new Mock<AppDbContext>();
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();
            var service = new EvolutionAnalyticsService(mockDbContext.Object, mockLogger.Object);

            // Act & Assert - start date after end date
            var exception = await Assert.ThrowsExceptionAsync<ArgumentException>(
                () => service.GetAnalysisHistoryAsync("user-123", DateTime.UtcNow, DateTime.UtcNow.AddDays(-30)));

            Assert.IsNotNull(exception);
        }

        [TestMethod]
        public async Task ComparePeriods_ThrowsOnNullUserId()
        {
            // Arrange
            var mockDbContext = new Mock<AppDbContext>();
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();
            var service = new EvolutionAnalyticsService(mockDbContext.Object, mockLogger.Object);

            // Act & Assert
            var exception = await Assert.ThrowsExceptionAsync<ArgumentException>(
                () => service.ComparePeriods(null,
                    DateTime.UtcNow.AddDays(-60), DateTime.UtcNow.AddDays(-31),
                    DateTime.UtcNow.AddDays(-30), DateTime.UtcNow));

            Assert.IsNotNull(exception);
        }

        [TestMethod]
        public async Task ComparePeriods_ThrowsOnOverlappingPeriods()
        {
            // Arrange
            var mockDbContext = new Mock<AppDbContext>();
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();
            var service = new EvolutionAnalyticsService(mockDbContext.Object, mockLogger.Object);

            // Act & Assert - periods overlap
            var exception = await Assert.ThrowsExceptionAsync<ArgumentException>(
                () => service.ComparePeriods("user-123",
                    DateTime.UtcNow.AddDays(-30), DateTime.UtcNow.AddDays(-5),
                    DateTime.UtcNow.AddDays(-10), DateTime.UtcNow));

            Assert.IsNotNull(exception);
        }

        [TestMethod]
        public async Task GeneratePdfReportAsync_ThrowsOnNullUserId()
        {
            // Arrange
            var mockDbContext = new Mock<AppDbContext>();
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();
            var service = new EvolutionAnalyticsService(mockDbContext.Object, mockLogger.Object);

            // Act & Assert
            var exception = await Assert.ThrowsExceptionAsync<ArgumentException>(
                () => service.GeneratePdfReportAsync(null, DateTime.UtcNow.AddDays(-30), DateTime.UtcNow));

            Assert.IsNotNull(exception);
        }

        [TestMethod]
        public async Task LogPdfExportAsync_ThrowsOnNullUserId()
        {
            // Arrange
            var mockDbContext = new Mock<AppDbContext>();
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();
            var service = new EvolutionAnalyticsService(mockDbContext.Object, mockLogger.Object);

            // Act & Assert
            var exception = await Assert.ThrowsExceptionAsync<ArgumentException>(
                () => service.LogPdfExportAsync(null, DateTime.UtcNow.AddDays(-30), DateTime.UtcNow, true, "127.0.0.1", "Chrome"));

            Assert.IsNotNull(exception);
        }

        [TestMethod]
        public async Task LogPdfExportAsync_SucceedsWithValiddata()
        {
            // Arrange
            var mockDbContext = new Mock<AppDbContext>();
            var mockLogger = new Mock<ILogger<EvolutionAnalyticsService>>();
            var service = new EvolutionAnalyticsService(mockDbContext.Object, mockLogger.Object);

            // Act
            await service.LogPdfExportAsync("user-123", DateTime.UtcNow.AddDays(-30), DateTime.UtcNow, true, "127.0.0.1", "Chrome");

            // Assert - No exception thrown, logged successfully
        }
    }
}
