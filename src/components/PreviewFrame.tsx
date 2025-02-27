import { WebContainer } from "@webcontainer/api"
import { useEffect, useState, useCallback } from "react"

interface PreviewFrameProps {
    files: any[],
    webContainer?: WebContainer,
    previewMode: 'code' | 'preview'
}

export const PreviewFrame = ({files, webContainer, previewMode}: PreviewFrameProps) => {
    const [url, setUrl] = useState("");
    const [isInstalling, setIsInstalling] = useState(false);
    const [error, setError] = useState("");
    const [isBuilt, setIsBuilt] = useState(false);
    const [lastBuildFiles, setLastBuildFiles] = useState<string>("");

    const buildAndPreview = useCallback(async () => {
        if (!webContainer) {
            setError("WebContainer is not initialized.");
            return;
        }

        try {
            setIsInstalling(true);
            
            // Check if files have changed since last build
            const currentFiles = JSON.stringify(files);
            if (isBuilt && currentFiles === lastBuildFiles) {
                setIsInstalling(false);
                return; // Skip rebuild if files haven't changed
            }

            // Install dependencies if not already installed
            if (!isBuilt) {
                const installProcess = await webContainer.spawn('npm', ['install']);
                const installExitCode = await installProcess.exit;
                
                if (installExitCode !== 0) {
                    throw new Error('Installation failed');
                }
            }

            // Start or restart the dev server
            const devProcess = await webContainer.spawn('npm', ['run', 'dev']);

            // Wait for server-ready event
            webContainer.on('server-ready', (port, url) => {
                setUrl(url);
                setIsInstalling(false);
                setIsBuilt(true);
                setLastBuildFiles(currentFiles);
            });

        } catch (err: any) {
            setError(`Failed to start preview: ${err.message}`);
            setIsInstalling(false);
        }
    }, [webContainer, files, isBuilt, lastBuildFiles]);

    useEffect(() => {
        if (previewMode === 'preview') {
            buildAndPreview();
        }
    }, [previewMode, buildAndPreview]);

    if (previewMode !== 'preview') return null;

    if (error) {
        return (
            <div className="h-full flex items-center justify-center text-red-400">
                {error}
            </div>
        );
    }

    return (
        <div className="h-full flex items-center justify-center text-gray-400">
            {isInstalling && (
                <div className="text-center">
                    <p className="mb-2">Setting up preview...</p>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                </div>
            )}
            {url && <iframe width={"100%"} height={"100%"} src={url} />}
        </div>
    );
}