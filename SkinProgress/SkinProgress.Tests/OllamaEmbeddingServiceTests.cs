using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using Moq;
using Moq.Protected;
using SkinProgress.Services;
using System.Net;
using System.Text;
using System.Text.Json;

namespace SkinProgress.Tests;

[TestClass]
public class OllamaEmbeddingServiceTests
{
    private Mock<HttpMessageHandler> _mockHandler = null!;
    private HttpClient _httpClient = null!;
    private Mock<IConfiguration> _mockConfig = null!;
    private Mock<ILogger<OllamaEmbeddingService>> _mockLogger = null!;

    [TestInitialize]
    public void Setup()
    {
        _mockHandler = new Mock<HttpMessageHandler>();
        _httpClient = new HttpClient(_mockHandler.Object);
        _mockConfig = new Mock<IConfiguration>();
        _mockLogger = new Mock<ILogger<OllamaEmbeddingService>>();

        _mockConfig.Setup(c => c["Ollama:Host"]).Returns("localhost");
        _mockConfig.Setup(c => c["Ollama:Port"]).Returns("11434");
        _mockConfig.Setup(c => c["Ollama:EmbeddingModel"]).Returns("bge-m3:latest");
    }

    [TestMethod]
    public async Task EmbedAsync_ReturnsFloatArrayFromOllamaResponse()
    {
        // Arrange
        var ollamaJson = JsonSerializer.Serialize(new
        {
            embeddings = new[] { new[] { 0.1f, 0.2f, 0.3f } }
        });

        _mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(ollamaJson, Encoding.UTF8, "application/json")
            });

        var service = new OllamaEmbeddingService(_httpClient, _mockConfig.Object, _mockLogger.Object);

        // Act
        var result = await service.EmbedAsync("test input text");

        // Assert
        Assert.AreEqual(3, result.Length);
        Assert.AreEqual(0.1f, result[0], 0.001f);
        Assert.AreEqual(0.2f, result[1], 0.001f);
        Assert.AreEqual(0.3f, result[2], 0.001f);
    }

    [TestMethod]
    public async Task EmbedAsync_SendsCorrectModelInRequestBody()
    {
        // Arrange
        HttpRequestMessage? capturedRequest = null;
        var ollamaJson = JsonSerializer.Serialize(new
        {
            embeddings = new[] { new[] { 0.5f } }
        });

        _mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .Callback<HttpRequestMessage, CancellationToken>((req, _) => capturedRequest = req)
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.OK,
                Content = new StringContent(ollamaJson, Encoding.UTF8, "application/json")
            });

        var service = new OllamaEmbeddingService(_httpClient, _mockConfig.Object, _mockLogger.Object);

        // Act
        await service.EmbedAsync("hello");

        // Assert
        Assert.IsNotNull(capturedRequest);
        Assert.AreEqual(HttpMethod.Post, capturedRequest.Method);
        var body = await capturedRequest.Content!.ReadAsStringAsync();
        StringAssert.Contains(body, "bge-m3:latest");
        StringAssert.Contains(body, "hello");
    }

    [TestMethod]
    [ExpectedException(typeof(HttpRequestException))]
    public async Task EmbedAsync_ThrowsWhenOllamaReturnsError()
    {
        // Arrange
        _mockHandler.Protected()
            .Setup<Task<HttpResponseMessage>>(
                "SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(new HttpResponseMessage
            {
                StatusCode = HttpStatusCode.ServiceUnavailable,
                Content = new StringContent("unavailable")
            });

        var service = new OllamaEmbeddingService(_httpClient, _mockConfig.Object, _mockLogger.Object);

        // Act — throws
        await service.EmbedAsync("hello");
    }
}
