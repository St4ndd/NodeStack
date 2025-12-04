
import React, { useState, useEffect, useRef } from 'react';
import { FileInfo, ServerConfig } from '../types';
import { Folder, FileText, Download, Upload, Trash2, ChevronRight, File as FileIcon, Archive, RefreshCw, X, Save, Edit3, ArrowLeft, AlertTriangle, Search, Plus, Code, Layout, Database } from 'lucide-react';
import { Button } from './Button';
import { useUI } from './UI';

interface FileManagerProps {
  server: ServerConfig;
}

export const FileManager: React.FC<FileManagerProps> = ({ server }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Editor State
  const [editorFile, setEditorFile] = useState<{ path: string, content: string, originalContent: string } | null>(null);
  const [editorMode, setEditorMode] = useState<'text' | 'visual'>('text');
  const [visualType, setVisualType] = useState<'properties' | 'json-array' | 'json-object' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [backendReady, setBackendReady] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Visual Data State
  const [properties, setProperties] = useState<Record<string, string>>({});
  const [jsonArray, setJsonArray] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast, confirm } = useUI();

  // Check backend health first
  useEffect(() => {
     fetch('/api/health')
       .then(res => {
         if(!res.ok) setBackendReady(false);
       })
       .catch(() => setBackendReady(false));
  }, []);

  const fetchFiles = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/files/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: server.path, subPath: currentPath })
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("Backend invalid response. Please check if 'node server.js' is running.");
      }

      if (!res.ok) {
         const errData = await res.json();
         throw new Error(errData.error || `Server Error: ${res.status}`);
      }

      const data = await res.json();
      setFiles(data);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Failed to load files");
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if(backendReady) fetchFiles();
  }, [server.path, currentPath, backendReady]);

  const handleNavigate = (folderName: string) => {
    setCurrentPath(prev => prev ? `${prev}/${folderName}` : folderName);
  };

  const handleUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const handleDelete = async (fileName: string) => {
    const ok = await confirm({
       title: `Delete ${fileName}?`,
       message: "This action cannot be undone.",
       confirmText: "Delete",
       variant: 'danger'
    });
    
    if (!ok) return;

    try {
       await fetch('/api/files/delete', {
         method: 'POST',
         headers: {'Content-Type': 'application/json'},
         body: JSON.stringify({ 
           path: server.path, 
           subPath: currentPath ? `${currentPath}/${fileName}` : fileName 
         })
       });
       fetchFiles();
       toast.success("File deleted");
    } catch (e) { toast.error('Delete failed'); }
  };

  const handleDownloadZip = async () => {
    const btn = document.getElementById('zip-btn');
    if(btn) btn.innerText = 'Compressing...';
    try {
      const res = await fetch('/api/files/zip', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ path: server.path })
      });
      const data = await res.json();
      if (data.success && data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
        toast.success("Download started");
      } else {
        toast.error('Compression failed', data.error || 'Unknown error');
      }
    } catch (e) { toast.error('Error downloading zip.'); }
    if(btn) btn.innerText = 'Download ZIP';
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        setUploading(true);
        
        const reader = new FileReader();
        reader.onload = async () => {
           const base64 = (reader.result as string).split(',')[1];
           try {
             const res = await fetch('/api/files/upload', {
               method: 'POST',
               headers: {'Content-Type': 'application/json'},
               body: JSON.stringify({
                 path: server.path,
                 subPath: currentPath,
                 name: file.name,
                 contentBase64: base64
               })
             });
             if(!res.ok) throw new Error('Upload failed');
             fetchFiles();
             toast.success("Upload successful");
           } catch(e) { toast.error('Upload failed'); }
           setUploading(false);
        };
        reader.readAsDataURL(file);
     }
  };

  const handleOpenFile = async (file: FileInfo) => {
    if (file.isDirectory) {
      handleNavigate(file.name);
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      toast.warning("File too large", "File >2MB cannot be edited in browser.");
      return;
    }

    const fullPath = currentPath ? `${server.path}/${currentPath}/${file.name}` : `${server.path}/${file.name}`;
    const isDat = file.name.endsWith('.dat');
    const endpoint = isDat ? '/api/read-nbt' : '/api/read-file';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath })
      });
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error("Backend invalid response. API endpoint missing?");
      }

      if(!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Read failed');
      }

      const data = await res.json();
      
      setEditorFile({
        path: fullPath,
        content: data.content,
        originalContent: data.content
      });

      // Determine Editor Mode
      const isProperties = file.name.endsWith('.properties') || file.name === 'eula.txt';
      const isJson = file.name.endsWith('.json');
      // Treat .dat files as read-only JSON for now
      const isNbt = file.name.endsWith('.dat');

      if (isProperties) {
        parseProperties(data.content);
        setVisualType('properties');
        setEditorMode('visual');
      } else if (isJson || isNbt) {
        try {
           const json = JSON.parse(data.content);
           if (Array.isArray(json)) {
              setJsonArray(json);
              setVisualType('json-array');
           } else {
              // Convert object to properties-like format for simple editing
              const props: Record<string, string> = {};
              Object.entries(json).forEach(([k, v]) => {
                  if (typeof v !== 'object') props[k] = String(v);
              });
              setProperties(props);
              setVisualType('json-object');
           }
           setEditorMode('visual');
        } catch(e) {
           setVisualType(null);
           setEditorMode('text');
        }
      } else {
        setVisualType(null);
        setEditorMode('text');
      }
      setSearchTerm('');

    } catch (e: any) { toast.error(`Could not read file`, e.message); }
  };

  const parseProperties = (content: string) => {
    const props: Record<string, string> = {};
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if(!trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...rest] = trimmed.split('=');
        props[key.trim()] = rest.join('=').trim();
      }
    });
    setProperties(props);
  };

  const handleSaveFile = async () => {
    if (!editorFile) return;
    if (editorFile.path.endsWith('.dat')) {
        toast.warning("Read Only", "NBT editing not supported.");
        return;
    }
    
    let contentToSave = editorFile.content;
    
    if (editorMode === 'visual') {
       if (visualType === 'properties') {
          let newContent = `#Edited via NodeStack\n#${new Date().toISOString()}\n`;
          Object.entries(properties).forEach(([key, val]) => {
             newContent += `${key}=${val}\n`;
          });
          contentToSave = newContent;
       } else if (visualType === 'json-array') {
          contentToSave = JSON.stringify(jsonArray, null, 2);
       } else if (visualType === 'json-object') {
          // Rebuild shallow object
          const newObj: any = {};
          Object.entries(properties).forEach(([key, val]) => {
              // Try to preserve types slightly
              if (val === 'true') newObj[key] = true;
              else if (val === 'false') newObj[key] = false;
              else if (!isNaN(Number(val)) && val !== '') newObj[key] = Number(val);
              else newObj[key] = val;
          });
          contentToSave = JSON.stringify(newObj, null, 2);
       }
    }

    try {
      await fetch('/api/write-file', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ path: editorFile.path, content: contentToSave })
      });
      setEditorFile(null);
      fetchFiles();
      toast.success("File Saved");
    } catch(e) { toast.error('Save failed'); }
  };

  const handleDeleteArrayItem = (index: number) => {
     const newArr = [...jsonArray];
     newArr.splice(index, 1);
     setJsonArray(newArr);
  };

  const handleArrayChange = (index: number, key: string, value: string) => {
      const newArr = [...jsonArray];
      // Auto-detect type
      let val: any = value;
      if (value === 'true') val = true;
      else if (value === 'false') val = false;
      else if (!isNaN(Number(value)) && value.trim() !== '') val = Number(value);
      
      newArr[index] = { ...newArr[index], [key]: val };
      setJsonArray(newArr);
  };

  if (!backendReady) {
      return (
          <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-12 text-center flex flex-col items-center justify-center h-full">
             <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
             <h3 className="text-xl font-bold text-white mb-2">Backend Disconnected</h3>
             <p className="text-zinc-500 max-w-sm mb-6">
                Cannot connect to the NodeStack backend API. Please ensure <code>node server.js</code> is running in your terminal.
             </p>
             <Button onClick={() => window.location.reload()}>Reload Page</Button>
          </div>
      );
  }

  // --- Editor View ---
  if (editorFile) {
    // Filter logic
    const filteredProps = Object.keys(properties).filter(k => k.toLowerCase().includes(searchTerm.toLowerCase()));
    
    // For arrays, check if any value in the object matches
    const filteredArray = jsonArray.map((item, idx) => ({ item, idx })).filter(({ item }) => {
        return JSON.stringify(item).toLowerCase().includes(searchTerm.toLowerCase());
    });

    const isReadOnly = editorFile.path.endsWith('.dat');

    return (
      <div className="bg-[#18181b] border border-zinc-800 rounded-xl h-full flex flex-col overflow-hidden">
         <div className="p-3 border-b border-zinc-800 bg-zinc-900/50 flex flex-col md:flex-row justify-between items-center gap-3">
             <div className="flex items-center gap-3 w-full md:w-auto">
               <button onClick={() => setEditorFile(null)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400">
                  <ArrowLeft className="w-5 h-5" />
               </button>
               <h3 className="text-white font-mono font-medium truncate max-w-[200px]" title={editorFile.path}>{editorFile.path.split('/').pop()}</h3>
               {isReadOnly && <span className="text-[10px] font-bold uppercase text-yellow-500 border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 rounded">Read Only</span>}
               
               {visualType && (
                 <div className="flex bg-zinc-950 rounded-lg p-1 border border-zinc-800 ml-2">
                    <button 
                      onClick={() => setEditorMode('visual')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${editorMode === 'visual' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <Layout className="w-3 h-3" /> Visual
                    </button>
                    <button 
                      onClick={() => setEditorMode('text')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${editorMode === 'text' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <Code className="w-3 h-3" /> Code
                    </button>
                 </div>
               )}
             </div>
             
             <div className="flex items-center gap-2 w-full md:w-auto">
                {editorMode === 'visual' && (
                   <div className="relative flex-1 md:w-64">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input 
                         type="text" 
                         placeholder="Search..." 
                         className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-4 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
                         value={searchTerm}
                         onChange={e => setSearchTerm(e.target.value)}
                      />
                   </div>
                )}
                <Button variant="secondary" onClick={() => setEditorFile(null)} className="whitespace-nowrap">Close</Button>
                {!isReadOnly && <Button onClick={handleSaveFile} className="whitespace-nowrap"><Save className="w-4 h-4" /> Save</Button>}
             </div>
         </div>
         
         <div className="flex-1 overflow-hidden relative bg-[#0f0f12]">
            {editorMode === 'text' ? (
               <textarea 
                 className="w-full h-full bg-transparent text-zinc-300 font-mono p-4 text-sm resize-none focus:outline-none"
                 value={editorFile.content}
                 onChange={e => setEditorFile({...editorFile, content: e.target.value})}
                 readOnly={isReadOnly}
               />
            ) : (
               <div className="h-full overflow-y-auto p-6">
                  {/* Properties & Simple JSON Object View */}
                  {(visualType === 'properties' || visualType === 'json-object') && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
                        {filteredProps.map(key => (
                            <div key={key} className="flex flex-col gap-1 group">
                                <label className="text-xs font-medium text-zinc-500 font-mono group-hover:text-emerald-500 transition-colors">{key}</label>
                                <input 
                                type="text" 
                                className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-white text-sm focus:border-emerald-500 outline-none focus:ring-1 focus:ring-emerald-500/50 disabled:opacity-50"
                                value={properties[key]}
                                onChange={e => setProperties({...properties, [key]: e.target.value})}
                                disabled={isReadOnly}
                                />
                            </div>
                        ))}
                        {filteredProps.length === 0 && <div className="col-span-full text-center text-zinc-500 py-8">No properties match your search.</div>}
                      </div>
                  )}

                  {/* JSON Array View (Ops, Whitelist, etc) */}
                  {visualType === 'json-array' && (
                      <div className="space-y-4">
                          {filteredArray.length === 0 && <div className="text-center text-zinc-500 py-8">No items match your search.</div>}
                          {filteredArray.map(({ item, idx }) => (
                              <div key={idx} className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 relative group hover:border-zinc-700 transition-colors">
                                  {!isReadOnly && (
                                    <button 
                                      onClick={() => handleDeleteArrayItem(idx)}
                                      className="absolute top-2 right-2 p-1.5 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                                      title="Remove Entry"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                      {Object.keys(item).map(key => (
                                          <div key={key} className="flex flex-col gap-1">
                                              <label className="text-[10px] uppercase font-bold text-zinc-600 font-mono">{key}</label>
                                              <input 
                                                  type="text" 
                                                  className="bg-black/20 border border-zinc-800 rounded px-2 py-1.5 text-zinc-300 text-sm focus:border-emerald-500 outline-none focus:text-white disabled:opacity-50"
                                                  value={String(item[key])}
                                                  onChange={e => handleArrayChange(idx, key, e.target.value)}
                                                  disabled={isReadOnly}
                                              />
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
               </div>
            )}
         </div>
      </div>
    );
  }

  // --- Browser View ---
  return (
    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-full">
      <div className="p-4 border-b border-zinc-800 bg-[#18181b] flex flex-col md:flex-row justify-between gap-4">
        
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
           <button onClick={() => setCurrentPath('')} className={`flex items-center gap-1 hover:text-white transition-colors ${!currentPath ? 'text-white font-bold' : 'text-zinc-500'}`}>
              <Folder className="w-4 h-4" /> Root
           </button>
           {currentPath.split('/').map((part, i, arr) => (
             <React.Fragment key={i}>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
                <button 
                  onClick={() => setCurrentPath(arr.slice(0, i + 1).join('/'))}
                  className={`hover:text-white transition-colors ${i === arr.length - 1 ? 'text-white font-bold' : 'text-zinc-500'}`}
                >
                  {part}
                </button>
             </React.Fragment>
           ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
           <input type="file" className="hidden" ref={fileInputRef} onChange={handleUpload} />
           <Button variant="secondary" className="text-xs h-8" onClick={() => fileInputRef.current?.click()} isLoading={uploading}>
              <Upload className="w-3.5 h-3.5" /> Upload
           </Button>
           <Button variant="secondary" className="text-xs h-8" onClick={handleDownloadZip} id="zip-btn">
              <Download className="w-3.5 h-3.5" /> Zip All
           </Button>
           <Button variant="secondary" className="text-xs h-8" onClick={fetchFiles}>
              <RefreshCw className="w-3.5 h-3.5" />
           </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
         {currentPath && (
           <div 
             onClick={handleUp}
             className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/50 cursor-pointer text-zinc-500 hover:text-zinc-300"
           >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm font-medium">..</span>
           </div>
         )}
         
         {loading ? (
           <div className="p-8 text-center text-zinc-500">Loading files...</div>
         ) : errorMsg ? (
           <div className="p-8 text-center flex flex-col items-center gap-2">
              <span className="text-red-400 font-medium">Error loading files</span>
              <span className="text-zinc-500 text-sm">{errorMsg}</span>
              <Button onClick={fetchFiles} variant="secondary" className="mt-2">Try Again</Button>
           </div>
         ) : files.length === 0 ? (
           <div className="p-8 text-center text-zinc-500 italic">Empty folder</div>
         ) : (
           <div className="divide-y divide-zinc-800/50">
              {files.map(file => (
                <div 
                   key={file.name} 
                   className="flex items-center justify-between px-4 py-3 hover:bg-zinc-900/50 group transition-colors cursor-pointer"
                   onClick={() => handleOpenFile(file)}
                >
                   <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${file.isDirectory ? 'bg-blue-500/10 text-blue-400' : 'bg-zinc-800 text-zinc-400'}`}>
                         {file.isDirectory ? <Folder className="w-5 h-5" /> : file.name.endsWith('.dat') ? <Database className="w-5 h-5 text-purple-400" /> : <FileText className="w-5 h-5" />}
                      </div>
                      <div className="min-w-0">
                         <div className="text-sm font-medium text-zinc-200 truncate group-hover:text-emerald-400 transition-colors">{file.name}</div>
                         <div className="text-xs text-zinc-500 flex gap-3">
                            <span>{file.isDirectory ? 'Folder' : (file.size / 1024).toFixed(1) + ' KB'}</span>
                            <span className="hidden md:inline">•</span>
                            <span className="hidden md:inline">{new Date(file.lastModified).toLocaleString()}</span>
                         </div>
                      </div>
                   </div>
                   
                   <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(file.name); }}
                        className="p-2 hover:bg-red-900/20 text-zinc-500 hover:text-red-500 rounded-lg transition-colors"
                        title="Delete"
                      >
                         <Trash2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleOpenFile(file); }}
                        className="p-2 hover:bg-zinc-800 text-zinc-500 hover:text-white rounded-lg transition-colors"
                        title="Edit"
                      >
                         <Edit3 className="w-4 h-4" />
                      </button>
                   </div>
                </div>
              ))}
           </div>
         )}
      </div>
    </div>
  );
};
