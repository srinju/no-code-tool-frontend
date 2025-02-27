import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FileCode, Folder, ChevronDown, ChevronRight, Terminal, Eye, Loader2 } from 'lucide-react';
import Editor from "@monaco-editor/react";
import { FileItem, Step, StepType } from '../types';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { parseXml } from '../steps';
import { useWebContainer } from '../hooks/useWebContainer';
import { FileNode } from '@webcontainer/api';
import { PreviewFrame } from '../components/PreviewFrame';

export default function BuilderPage() {
  const location = useLocation();
  const prompt = location.state?.prompt || '';

  const [steps,setSteps] = useState<Step[]>([]);

  const[files , setFiles] = useState<FileItem[]>([]);

  const [fileStructure] = useState<FileItem[]>([]);

  const webContainer = useWebContainer(); //boots the webcontainer and save the instance of the webContainer

  const [followUpPrompt , setFollowUpPrompt] = useState("");
  const [isLodading , setIsLoading] = useState(false);

  //state for storing the llm messages >
  const [llmMessages , setllmMessages] = useState<{role : "user" | "assistant" , content : string}[]>([]);
    
  useEffect(() => {
    const init = async() => {

        try {

          //send the prompt of the user to the backend at /template get the prompts and the ui prompts
          //then send the prompts to the /chat and the prompt of the user to gete the code back

          const response = await axios.post(`${BACKEND_URL}/template`,{
            prompt : prompt.trim()
          });

          console.log("response from the /template endpoint!!", response.data);

          //get the prompts >
          const {prompts , uiPrompts} = response.data;
          //console.log("ui prompts :-------------------" , uiPrompts);

          //console.log('PARSED UI PROMPTS : -----------------------' , parseXml(uiPrompts));

          setSteps(parseXml(uiPrompts).map((x : Step) => ({
            ...x,
            status : "pending" as "pending"
          })));

          //send another request to /chat with the prompts and the userPrompt

          const anotherResponse = await axios.post(`${BACKEND_URL}/chat` , {
            messages : [...prompts , prompt].map(content => ({
                role : "user",
                content : content
            }))
          });

          console.log("response from the chaat endpoint : " , anotherResponse);

          //update the steps when the code with the new shit comes it will update the build files 
          setSteps(s => [...s , ...parseXml(anotherResponse.data.response).map(x => ({
            ...x,
            status : "pending" as "pending"
          }))]);


          setllmMessages([...prompts , prompt].map(content => ({
            role : "user",
            content : content
        })));

          setllmMessages(x => [...x, {role: "assistant", content: anotherResponse.data.response}])

        } catch (error) {

          console.error("there was an error sending the request to the backend! " , error);

        }
    }
    init();
  },[]);


  const handleFollowUpPrompt = async() => {

    setIsLoading(true);
    try {

      const newMessage = {
          role : "user" as "user",
          content : followUpPrompt
      }
      
      const response = await axios.post(`${BACKEND_URL}/chat` , {
        messages : [...llmMessages , newMessage]
      });
      
      console.log("respons from the follow up prompt : -------------------------", response);

      setllmMessages(x => [...x , newMessage]);

      setllmMessages(x => [...x , {
        role : "assistant",
        content : response.data.response
      }])

      setSteps(s => [...s , ...parseXml(response.data.response).map(x => ({
        ...x,
        status : "pending" as "pending"
      }))]);

      setFollowUpPrompt("");

    } catch (error) {
        console.error("an error occured while sending the follow up prompt to the backend!!" , error);
    } finally {
      setIsLoading(false);
    }
  }

  //from /template we get the uiPrompts from there we parse the steps 
  //now we want to make the initial files 

  //trigger the useffect when the file comes and the steps are there

  //the steps state looks like this >

  /*
  
  code : "<!doctype html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <link rel=\"icon\" type=\"image/svg+xml\" href=\"/vite.svg\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Vite + React + TS</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.tsx\"></script>\n  </body>\n</html>"
  description :  ""
  id : 3 
  path : "index.html"
  status : "pending"
  title : "Create index.html"

  */


  const getLanguageFromPath = (path: string): string => {
    const extension = path.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'js':
        return 'javascript';
      case 'ts':
        return 'typescript';
      case 'tsx' : 
        return 'typescript';
      case 'jsx':
        return 'javascript';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      default:
        return 'plaintext'; // Fallback for unknown file types
    }
  };

  useEffect(() => {
    
    let originalFiles = [...files]; //clone files without affecting the original files
    let updateHappened = false; //setting a false flag for updates made
    //looping through each pending steps and make them updatehappened true and do the needful
    steps.filter(({ status }) => status === 'pending').forEach(step => {
      updateHappened = true;
      //check if the step is a file creation step and the file has a path
      if (step.type === StepType.CreateFile && step.path) {
        let parsedPath = step.path.split("/"); //parsing file path
        let currentFileStructure = [...originalFiles];
        let finalAnswerRef = currentFileStructure;
  
        let currentFolder = "";
        //loop until all path segments are completed
        while (parsedPath.length) {
          currentFolder = `${currentFolder}/${parsedPath[0]}`; //build the currnet folder and path one at a time
          let currentFolderName = parsedPath[0]; //save the current folder name
          parsedPath = parsedPath.slice(1); //remove the processed segment from the path array
  
          if (!parsedPath.length) {
            //this means we are at the last segnemtnt (actual files)
            let file = currentFileStructure.find(x => x.path === currentFolder);
            if (!file) {
              currentFileStructure.push({
                name: currentFolderName,
                type: 'file',
                path: currentFolder,
                content: step.code || '',
                language : getLanguageFromPath(currentFolderName)
              });
            } else {
              file.content = step.code || '';
            }
            
            //mount the files in the webcontainer >>
            webContainer?.mount(({
              [currentFolder] : {
                file : {
                  contents : step.code
                }
              } as FileNode
              
            }));
          } else {
            //folder creation logic >
            let folder = currentFileStructure.find(x => x.path === currentFolder);
            if (!folder) {
              currentFileStructure.push({
                name: currentFolderName,
                type: 'folder',
                path: currentFolder,
                children: []
              });
            }
  
            currentFileStructure = currentFileStructure.find(x => x.path === currentFolder)?.children || [];
          }
        }
        originalFiles = finalAnswerRef;
      }
    });
  
    if (updateHappened) {
      setFiles(originalFiles);
      setSteps(steps => steps.map((s: Step) => ({
        ...s,
        status: "completed"
      })));
    }

    console.log("files --------------------------------- " , files);
  }, [steps, files]);


  //for mounting the files and folders in the web container >>


  useEffect(() => {

    const createMountStructure = (files: FileItem[]): Record<string, any> => {
      const mountStructure: Record<string, any> = {};
  
      const processFile = (file: FileItem, isRootFolder: boolean) => {  
        if (file.type === 'folder') {
          // For folders, create a directory entry
          mountStructure[file.name] = {
            directory: file.children ? 
              Object.fromEntries(
                file.children.map(child => [child.name, processFile(child, false)])
              ) 
              : {}
          };
        } else if (file.type === 'file') {
          if (isRootFolder) {
            mountStructure[file.name] = {
              file: {
                contents: file.content || ''
              }
            };
          } else {
            // For files, create a file entry with contents
            return {
              file: {
                contents: file.content || ''
              }
            };
          }
        }
  
        return mountStructure[file.name];
      };
  
      // Process each top-level file/folder
      files.forEach(file => processFile(file, true));
  
      return mountStructure;
    };
  
    const mountStructure = createMountStructure(files);
  
    // Mount the structure if WebContainer is available
    console.log("mount structure -------------------------------------" ,mountStructure);
    webContainer?.mount(mountStructure);

  }, [files, webContainer]);


  console.log("web container instance -------------------------------------" , webContainer);



  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src']));
  const [previewMode, setPreviewMode] = useState<'code' | 'preview'>('code');

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  console.log("steps -----------------------------------------------------------", steps);

  const renderFileTree = (items: FileItem[], path = '') => {
    // Sort items: folders first, then files, both alphabetically
    const sortedItems = [...items].sort((a, b) => {
      // If types are different, folders come first
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      // If types are the same, sort alphabetically
      return a.name.localeCompare(b.name);
    });
  
    return sortedItems.map((item) => {
      // Rest of your rendering code remains the same
      const currentPath = path ? `${path}/${item.name}` : item.name;
      const isExpanded = expandedFolders.has(currentPath);
  
      if (item.type === 'folder') {
        return (
          <div key={currentPath}>
            <button
              onClick={() => toggleFolder(currentPath)}
              className="flex items-center gap-2 w-full hover:bg-gray-700 px-2 py-1 rounded text-left"
            >
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <Folder size={16} className="text-blue-400" />
              <span>{item.name}</span>
            </button>
            {isExpanded && item.children && (
              <div className="pl-4">
                {renderFileTree(item.children, currentPath)}
              </div>
            )}
          </div>
        );
      }
  
      return (
        <button
          key={currentPath}
          onClick={() => setSelectedFile(item)}
          className={`flex items-center gap-2 w-full hover:bg-gray-700 px-2 py-1 rounded text-left ${
            selectedFile === item ? 'bg-gray-700' : ''
          }`}
        >
          <FileCode size={16} className="text-gray-400" />
          <span>{item.name}</span>
        </button>
      );
    });
  };

  return (
    <div className="h-screen bg-gray-950 text-white flex font-sans">
      {/* Left Sidebar - Steps */}
      <div className="w-80 bg-gray-900 p-6 overflow-y-auto border-r border-gray-800 shadow-lg">
        <h2 className="text-2xl font-semibold mb-6 text-white">Website Build Progress</h2>
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <div className={`flex items-center gap-4 ${step.status === 'completed' ? 'text-green-400' : step.status === 'current' ? 'text-blue-400' : 'text-gray-500'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step.status === 'completed' ? 'bg-green-500/10' : step.status === 'current' ? 'bg-blue-500/10' : 'bg-gray-800'}`}>
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-medium text-white">{step.title}</h3>
                  <p className="text-sm text-gray-400"></p>
                </div>
              </div>
              {index < steps.length - 1 && <div className="absolute left-4 top-8 w-px h-8 bg-gray-800"></div>}
            </div>
          ))}
        </div>
        {/* Follow-Up Prompt Section */}
        <div className="mt-8">
          <textarea
            value={followUpPrompt}
            onChange={(e) => setFollowUpPrompt(e.target.value)}
            placeholder="Refine your website (e.g., 'Add a contact form')..."
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all duration-200"
            rows={3}
          />
          <button
            onClick={handleFollowUpPrompt}
            disabled={isLodading}
            className="mt-3 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-500/50 transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isLodading ? (
              <>
                <Loader2 size={20} className="animate-spin" /> Processing
              </>
            ) : (
              'Submit'
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-14 bg-gray-900 flex items-center px-4 gap-4 border-b border-gray-800">
          <button
            onClick={() => setPreviewMode('code')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${previewMode === 'code' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <FileCode size={20} /> Code
          </button>
          <button
            onClick={() => setPreviewMode('preview')}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 ${previewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-800'}`}
          >
            <Eye size={20} /> Preview
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex">
          {/* File Explorer */}
          <div className="w-72 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto shadow-inner">
            <h3 className="text-lg font-semibold mb-4 text-white">File Explorer</h3>
            {files.length ? renderFileTree(files) : <p className="text-gray-500">Building files...</p>}
          </div>

          {/* Code/Preview Area */}
          <div className="flex-1 bg-gray-950">
            {previewMode === 'code' ? (
              selectedFile ? (
                <Editor
                  height="100%"
                  theme="vs-dark"
                  language={selectedFile.language}
                  value={selectedFile.content}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    padding: { top: 16 },
                  }}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400">
                  Select a file to view its contents
                </div>
              )
            ) : (
              <PreviewFrame files={files} webContainer={webContainer} />
            )}
          </div>
        </div>
      </div>

      {/* Optional CSS for Fancy Touches */}
      <style>{`
        .shadow-inner {
          box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        button:disabled {
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}