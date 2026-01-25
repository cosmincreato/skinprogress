import { useState, useRef, useEffect } from 'react';

const SelfieCamera = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [isReady, setIsReady] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setError(null);
        setIsReady(false);

        const stopAllTracks = () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };

        const attachStream = (stream: MediaStream) => {
            if (cancelled) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }
            stopAllTracks();
            streamRef.current = stream;
            const video = videoRef.current;
            if (video) {
                video.srcObject = stream;
                video.muted = true;
                video.playsInline = true;
                video.play().catch(() => {});
            }
            if (!cancelled) setIsReady(true);
        };

        const startCamera = async () => {
            setError(null);
            stopAllTracks();

            const tryGetUserMedia = async (constraints: MediaStreamConstraints) => {
                const stream = await navigator.mediaDevices.getUserMedia(constraints);
                if (cancelled) {
                    stream.getTracks().forEach((t) => t.stop());
                    return null;
                }
                return stream;
            };

            try {
                let stream: MediaStream | null = null;
                try {
                    stream = await tryGetUserMedia({
                        video: { facingMode: 'user' },
                        audio: false,
                    });
                } catch (userErr) {
                    if (cancelled) return;
                    if (userErr instanceof DOMException && userErr.name === 'NotReadableError') {
                        await new Promise((resolve) => setTimeout(resolve, 200));
                        if (cancelled) return;
                        try {
                            stream = await tryGetUserMedia({ video: true, audio: false });
                        } catch (retryErr) {
                            throw userErr;
                        }
                    } else {
                        throw userErr;
                    }
                }

                if (!stream) return;
                attachStream(stream);
            } catch (err) {
                if (cancelled) return;
                stopAllTracks();
                if (typeof console !== 'undefined' && console.error) console.error('Camera error:', err);
                if (err instanceof DOMException) {
                    if (err.name === 'NotAllowedError') {
                        setError('Camera access denied. Please allow camera permission.');
                    } else if (err.name === 'NotFoundError') {
                        setError('No camera found.');
                    } else if (err.name === 'NotReadableError') {
                        setError(
                            'Camera couldn\'t start. Try: 1) Close other browser tabs using the camera, 2) Close any camera apps (Windows Camera, etc.), 3) Restart your browser, then click "Try again".'
                        );
                    } else if (err.name === 'OverconstrainedError') {
                        setError('Camera does not support requested settings. Try another device.');
                    } else {
                        setError(`Could not access camera (${err.name}). Try again.`);
                    }
                } else {
                    setError('Could not access camera. Try again.');
                }
            }
        };

        startCamera();
        return () => {
            cancelled = true;
            stopAllTracks();
        };
    }, [retryCount]);

    const capture = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !isReady || !streamRef.current) return;
        if (!video.videoWidth || !video.videoHeight) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(dataUrl);
    };

    const retake = () => {
        setCapturedImage(null);
    };

    if (error) {
        return (
            <div className="rounded-xl overflow-hidden bg-gray-800/50 border border-gray-700 p-6 text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                    type="button"
                    onClick={() => setRetryCount((c) => c + 1)}
                    className="py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-white text-sm font-medium transition-colors"
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="rounded-xl overflow-hidden bg-gray-800/50 border border-gray-700">
            <div className="relative aspect-[4/3] max-h-[400px] bg-black flex items-center justify-center overflow-hidden">
                {!isReady && !capturedImage && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-black">
                        <span className="text-gray-500 text-sm">Starting camera…</span>
                    </div>
                )}

                {capturedImage && (
                    <img
                        src={capturedImage}
                        alt="Selfie"
                        className="absolute inset-0 w-full h-full object-cover scale-x-[-1] z-10"
                    />
                )}

                <video
                    ref={videoRef}
                    muted
                    playsInline
                    className={`w-full h-full object-cover scale-x-[-1] ${capturedImage ? 'invisible absolute inset-0' : ''}`}
                />

                <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="p-4 flex gap-3 justify-center">
                {capturedImage ? (
                    <button
                        type="button"
                        onClick={retake}
                        className="py-2 px-5 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium transition-colors"
                    >
                        Retake
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={capture}
                        disabled={!isReady}
                        className="py-2 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors"
                    >
                        Take selfie
                    </button>
                )}
            </div>
        </div>
    );
};

export default SelfieCamera;
