'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Server, HardDrive, Folder, File, FolderPlus, Upload, Trash2,
  Edit, Download, Search, Grid, List, RefreshCw, Plus, X,
  ChevronLeft, ChevronRight, FileText, Image as ImageIcon, Video as VideoIcon,
  Music, Code, Copy, ExternalLink, Key, Check, Info, AlertTriangle,
  Play, Settings, Eye, LogOut, ArrowLeft, ArrowUp, MoreVertical
} from 'lucide-react';

const getAccentColors = (item) => {
  return {
    hex: '#db8a0e',
    hover: '#be6500',
    rgb: '219, 138, 14'
  };
};

export default function Home() {
  // --- STATE MANAGEMENT ---
  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [buckets, setBuckets] = useState([]);
  const [activeBucket, setActiveBucket] = useState('');
  const [prefix, setPrefix] = useState('');
  const [items, setItems] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewType, setViewType] = useState('list'); // 'list' | 'grid'
  const [activeDropdownItem, setActiveDropdownItem] = useState(null); // name of item with open dropdown

  // Loading states
  const [loading, setLoading] = useState({
    profiles: false,
    buckets: false,
    items: false,
    operation: false,
    test: false
  });

  // Notifications / Toasts
  const [toasts, setToasts] = useState([]);

  // Modals visibility
  const [modals, setModals] = useState({
    profileForm: false,
    createBucket: false,
    createFolder: false,
    deleteConfirm: null // holds object info if active
  });

  // Form states
  const [newProfile, setNewProfile] = useState({
    name: '',
    endpoint: '',
    port: '',
    accessKey: '',
    secretKey: '',
    useSSL: false,
    defaultBucket: ''
  });
  const [newBucketName, setNewBucketName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // Selected item / preview & edit
  const [selectedItem, setSelectedItem] = useState(null);
  const [previewError, setPreviewError] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef(null);

  const [uploadStatus, setUploadStatus] = useState({
    isUploading: false,
    totalFiles: 0,
    uploadedCount: 0,
    currentFileName: ''
  });

  // Universal confirmation modal state
  const [confirmState, setConfirmState] = useState(null);
  const [confirmInputText, setConfirmInputText] = useState('');

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveDropdownItem(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  // --- INITIAL LOADING ---
  useEffect(() => {
    const initializeProfiles = async () => {
      let defaultProfile = null;
      try {
        const response = await fetch('/api/minio/config');
        const data = await response.json();
        if (data.success && data.config) {
          defaultProfile = data.config;
        }
      } catch (err) {
        console.error('Failed to fetch default config:', err);
      }

      // Load profiles from localStorage
      let customProfiles = [];
      const savedProfiles = localStorage.getItem('cinio_profiles');
      if (savedProfiles) {
        try {
          customProfiles = JSON.parse(savedProfiles);
        } catch (e) {
          console.error('Error parsing profiles', e);
        }
      }

      // Filter out any stored profile that accidentally has the ID 'default' to avoid conflicts
      customProfiles = customProfiles.filter(p => p.id !== 'default');

      // Combine profiles, with the default profile at the top if it exists
      const combined = defaultProfile ? [defaultProfile, ...customProfiles] : customProfiles;
      setProfiles(combined);

      if (combined.length > 0) {
        // Select last used profile, but check if it's still available in the combined list
        const lastActiveId = localStorage.getItem('cinio_active_profile_id');
        const activeExists = combined.some(p => p.id === lastActiveId);

        if (activeExists && lastActiveId) {
          setActiveProfileId(lastActiveId);
        } else if (defaultProfile) {
          // If default profile exists, connect to it by default
          setActiveProfileId('default');
        } else {
          // Otherwise fallback to the first profile
          setActiveProfileId(combined[0].id);
        }
      } else {
        // Open profile modal if no profiles exist at all
        setModals(prev => ({ ...prev, profileForm: true }));
      }
    };

    initializeProfiles();
  }, []);

  // Fetch buckets when active profile changes
  useEffect(() => {
    if (activeProfileId) {
      localStorage.setItem('cinio_active_profile_id', activeProfileId);
      const profile = profiles.find(p => p.id === activeProfileId);
      if (profile) {
        fetchBuckets(profile);
      }
    } else {
      setBuckets([]);
      setActiveBucket('');
      setItems([]);
    }
  }, [activeProfileId, profiles]);

  // Fetch objects when active bucket or prefix changes
  useEffect(() => {
    if (activeProfileId && activeBucket) {
      fetchObjects();
    } else {
      setItems([]);
    }
  }, [activeBucket, prefix]);

  // Toast notification helper
  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const getActiveProfile = () => {
    return profiles.find(p => p.id === activeProfileId);
  };

  const getHeaders = (profile) => {
    const active = profile || getActiveProfile();
    if (!active) return {};
    return {
      'x-minio-endpoint': active.endpoint || '',
      'x-minio-port': active.port || '',
      'x-minio-use-ssl': active.useSSL ? 'true' : 'false',
      'x-minio-access-key': active.accessKey || '',
      'x-minio-secret-key': active.secretKey || '',
      'x-minio-default-bucket': active.defaultBucket || '',
    };
  };

  // --- API CALLS ---

  // Test credentials in form
  const testConnection = async () => {
    if (!newProfile.endpoint || !newProfile.accessKey || !newProfile.secretKey) {
      showToast('Please fill in Endpoint, Access Key, and Secret Key', 'error');
      return;
    }

    setLoading(prev => ({ ...prev, test: true }));
    try {
      const response = await fetch('/api/minio/test', {
        headers: {
          'x-minio-endpoint': newProfile.endpoint,
          'x-minio-port': newProfile.port,
          'x-minio-use-ssl': newProfile.useSSL ? 'true' : 'false',
          'x-minio-access-key': newProfile.accessKey,
          'x-minio-secret-key': newProfile.secretKey,
          'x-minio-default-bucket': newProfile.defaultBucket || '',
        }
      });
      const data = await response.json();
      if (data.success) {
        showToast(data.isRestricted
          ? `Connected successfully! Access to bucket "${newProfile.defaultBucket}" confirmed.`
          : `Connected successfully! Found ${data.count} bucket(s).`,
          'success'
        );
      } else {
        showToast(`Connection failed: ${data.error}`, 'error');
      }
    } catch (error) {
      showToast(`Connection failed: ${error.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, test: false }));
    }
  };

  const handleDefaultProfileFailure = () => {
    const custom = profiles.filter(p => p.id !== 'default');
    if (custom.length > 0) {
      showToast('Default profile connection failed. Switching to custom profile.', 'error');
      setActiveProfileId(custom[0].id);
    } else {
      showToast('Default profile connection failed. Please configure a custom profile.', 'error');
      setActiveProfileId('');
      setModals(prev => ({ ...prev, profileForm: true }));
    }
  };

  // Fetch buckets
  const fetchBuckets = async (profile) => {
    setLoading(prev => ({ ...prev, buckets: true }));
    try {
      const response = await fetch('/api/minio/buckets', {
        headers: getHeaders(profile)
      });
      const data = await response.json();
      if (data.success) {
        setBuckets(data.buckets);
        // Autoselect default bucket if it exists in the list
        if (profile.defaultBucket && data.buckets.some(b => b.name === profile.defaultBucket)) {
          setActiveBucket(profile.defaultBucket);
        } else if (data.buckets.length > 0 && (!activeBucket || !data.buckets.some(b => b.name === activeBucket))) {
          setActiveBucket(data.buckets[0].name);
        } else if (data.buckets.length === 0) {
          setActiveBucket('');
        }
      } else {
        showToast(`Error fetching buckets: ${data.error}`, 'error');
        if (profile.id === 'default') {
          handleDefaultProfileFailure();
        }
      }
    } catch (error) {
      showToast(`Error fetching buckets: ${error.message}`, 'error');
      if (profile.id === 'default') {
        handleDefaultProfileFailure();
      }
    } finally {
      setLoading(prev => ({ ...prev, buckets: false }));
    }
  };

  // Fetch objects
  const fetchObjects = async () => {
    const profile = getActiveProfile();
    if (!profile || !activeBucket) return;

    setLoading(prev => ({ ...prev, items: true }));
    try {
      const query = new URLSearchParams({
        bucket: activeBucket,
        prefix: prefix
      });
      const response = await fetch(`/api/minio/objects?${query.toString()}`, {
        headers: getHeaders(profile)
      });
      const data = await response.json();
      if (data.success) {
        setItems(data.items);
      } else {
        showToast(`Error listing objects: ${data.error}`, 'error');
      }
    } catch (error) {
      showToast(`Error listing objects: ${error.message}`, 'error');
    } finally {
      setLoading(prev => ({ ...prev, items: false }));
    }
  };

  // Create Bucket
  const handleCreateBucket = async (e) => {
    e.preventDefault();
    if (!newBucketName) return;

    setConfirmState({
      title: 'Create Bucket',
      message: `Are you sure you want to create a new bucket named "${newBucketName}"?`,
      actionLabel: 'Create Bucket',
      actionVariant: 'primary',
      onConfirm: async () => {
        setLoading(prev => ({ ...prev, operation: true }));
        try {
          const response = await fetch('/api/minio/buckets', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getHeaders()
            },
            body: JSON.stringify({ bucketName: newBucketName })
          });
          const data = await response.json();
          if (data.success) {
            showToast(`Bucket "${newBucketName}" created successfully!`);
            setNewBucketName('');
            setModals(prev => ({ ...prev, createBucket: false }));
            // Refresh buckets
            fetchBuckets(getActiveProfile());
            // Select it
            setActiveBucket(newBucketName);
            setPrefix('');
          } else {
            showToast(data.error, 'error');
          }
        } catch (error) {
          showToast(error.message, 'error');
        } finally {
          setLoading(prev => ({ ...prev, operation: false }));
        }
      }
    });
  };

  // Delete Bucket
  const handleDeleteBucket = async (bucketName) => {
    setConfirmState({
      title: 'Delete Bucket',
      message: `Are you absolutely sure you want to delete the bucket "${bucketName}"? All data inside it will be permanently lost. This action is irreversible.`,
      actionLabel: 'Delete Bucket',
      actionVariant: 'danger',
      showInput: true,
      expectedInputValue: bucketName,
      inputPlaceholder: `Type ${bucketName} to confirm`,
      onConfirm: async () => {
        setLoading(prev => ({ ...prev, operation: true }));
        try {
          const response = await fetch(`/api/minio/buckets?bucket=${bucketName}`, {
            method: 'DELETE',
            headers: getHeaders()
          });
          const data = await response.json();
          if (data.success) {
            showToast(`Bucket "${bucketName}" deleted successfully!`);
            if (activeBucket === bucketName) {
              setActiveBucket('');
              setPrefix('');
            }
            fetchBuckets(getActiveProfile());
          } else {
            showToast(data.error, 'error');
          }
        } catch (error) {
          showToast(error.message, 'error');
        } finally {
          setLoading(prev => ({ ...prev, operation: false }));
        }
      }
    });
  };

  // Create Folder (Empty object ending in '/')
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName) return;

    setConfirmState({
      title: 'Create Folder',
      message: `Are you sure you want to create a new folder named "${newFolderName}"?`,
      actionLabel: 'Create Folder',
      actionVariant: 'primary',
      onConfirm: async () => {
        setLoading(prev => ({ ...prev, operation: true }));
        try {
          const response = await fetch('/api/minio/object', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...getHeaders()
            },
            body: JSON.stringify({
              bucketName: activeBucket,
              folderName: newFolderName,
              prefix: prefix
            })
          });
          const data = await response.json();
          if (data.success) {
            showToast(`Folder "${newFolderName}" created successfully!`);
            setNewFolderName('');
            setModals(prev => ({ ...prev, createFolder: false }));
            fetchObjects();
          } else {
            showToast(data.error, 'error');
          }
        } catch (error) {
          showToast(error.message, 'error');
        } finally {
          setLoading(prev => ({ ...prev, operation: false }));
        }
      }
    });
  };

  // File Upload
  const uploadFiles = async (files) => {
    if (!activeBucket) {
      showToast('Select a bucket first', 'error');
      return;
    }

    setConfirmState({
      title: 'Upload Files',
      message: `Are you sure you want to upload ${files.length} file(s) to the bucket "${activeBucket}"?`,
      actionLabel: 'Upload Files',
      actionVariant: 'primary',
      onConfirm: async () => {
        setLoading(prev => ({ ...prev, operation: true }));
        setUploadStatus({
          isUploading: true,
          totalFiles: files.length,
          uploadedCount: 0,
          currentFileName: files[0]?.name || ''
        });

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploadStatus(prev => ({
            ...prev,
            currentFileName: file.name,
            uploadedCount: i
          }));

          const formData = new FormData();
          formData.append('bucket', activeBucket);
          formData.append('prefix', prefix);
          formData.append('file', file);

          try {
            const response = await fetch('/api/minio/object', {
              method: 'POST',
              headers: getHeaders(),
              body: formData
            });
            const data = await response.json();
            if (data.success) {
              successCount++;
            } else {
              failCount++;
              console.error(`Failed to upload ${file.name}: ${data.error}`);
            }
          } catch (error) {
            failCount++;
            console.error(`Failed to upload ${file.name}: ${error.message}`);
          }
        }

        setUploadStatus(prev => ({
          ...prev,
          uploadedCount: files.length,
          currentFileName: ''
        }));

        if (successCount > 0) {
          showToast(`Successfully uploaded ${successCount} file(s)`);
          fetchObjects();
        }
        if (failCount > 0) {
          showToast(`Failed to upload ${failCount} file(s)`, 'error');
        }

        setLoading(prev => ({ ...prev, operation: false }));
        setTimeout(() => {
          setUploadStatus(prev => ({ ...prev, isUploading: false }));
        }, 800);
      }
    });
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      uploadFiles(e.target.files);
    }
  };

  // Drag and drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    if (!activeBucket) return;
    dragCounter.current++;
    if (dragCounter.current === 1) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    if (!activeBucket) return;
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounter.current = 0;
    if (activeBucket && e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  // Delete File/Folder
  const handleDeleteItem = async (item) => {
    setLoading(prev => ({ ...prev, operation: true }));
    try {
      const query = new URLSearchParams({
        bucket: activeBucket,
        name: item.name
      });
      const response = await fetch(`/api/minio/object?${query.toString()}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const data = await response.json();
      if (data.success) {
        showToast(item.type === 'folder' ? 'Folder deleted recursively' : 'File deleted successfully');
        if (selectedItem && selectedItem.name === item.name) {
          setSelectedItem(null);
        }
        setModals(prev => ({ ...prev, deleteConfirm: null }));
        fetchObjects();
      } else {
        showToast(data.error, 'error');
      }
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      setLoading(prev => ({ ...prev, operation: false }));
    }
  };

  // View / Read File Details
  const handleViewFile = async (item) => {
    setSelectedItem(item);
    setPreviewError(false);
    setEditorContent('');
    setIsEditorDirty(false);

    if (item.type === 'folder') {
      setPrefix(item.name);
      setSelectedItem(null);
      return;
    }

    const previewType = getPreviewType(item.name);
    if (previewType === 'text') {
      setLoading(prev => ({ ...prev, operation: true }));
      try {
        const query = new URLSearchParams({
          bucket: activeBucket,
          name: item.name,
          action: 'read'
        });
        const response = await fetch(`/api/minio/object?${query.toString()}`, {
          headers: getHeaders()
        });
        const data = await response.json();
        if (data.success) {
          setEditorContent(data.content);
        } else {
          showToast(`Error reading file: ${data.error}`, 'error');
        }
      } catch (error) {
        showToast(`Error reading file: ${error.message}`, 'error');
      } finally {
        setLoading(prev => ({ ...prev, operation: false }));
      }
    }
  };

  // Save Text Edits
  const handleSaveTextFile = async () => {
    if (!selectedItem) return;

    setConfirmState({
      title: 'Save Changes',
      message: `Are you sure you want to save changes to "${selectedItem.displayName}"? This will overwrite the existing file content on the server.`,
      actionLabel: 'Save Changes',
      actionVariant: 'success',
      onConfirm: async () => {
        setIsSavingFile(true);
        try {
          const response = await fetch('/api/minio/object', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...getHeaders()
            },
            body: JSON.stringify({
              bucketName: activeBucket,
              objectName: selectedItem.name,
              content: editorContent
            })
          });
          const data = await response.json();
          if (data.success) {
            showToast('Changes saved successfully!');
            setIsEditorDirty(false);
            // Refresh listing sizes
            fetchObjects();
          } else {
            showToast(`Error saving file: ${data.error}`, 'error');
          }
        } catch (error) {
          showToast(`Error saving file: ${error.message}`, 'error');
        } finally {
          setIsSavingFile(false);
        }
      }
    });
  };

  // Profile management operations
  const handleAddProfile = (e) => {
    e.preventDefault();
    if (!newProfile.name || !newProfile.endpoint || !newProfile.accessKey || !newProfile.secretKey) {
      showToast('All fields except Port and Default Bucket are required', 'error');
      return;
    }

    setConfirmState({
      title: 'Add Connection Profile',
      message: `Are you sure you want to add the profile "${newProfile.name}"?`,
      actionLabel: 'Add Profile',
      actionVariant: 'primary',
      onConfirm: () => {
        const profileId = Date.now().toString();
        const newProfileEntry = { ...newProfile, id: profileId };
        const updatedProfiles = [...profiles, newProfileEntry];

        setProfiles(updatedProfiles);

        // Save only custom profiles (not the 'default' config profile) to localStorage
        const customProfiles = updatedProfiles.filter(p => p.id !== 'default');
        localStorage.setItem('cinio_profiles', JSON.stringify(customProfiles));
        setActiveProfileId(profileId);

        // Reset form
        setNewProfile({
          name: '',
          endpoint: '',
          port: '',
          accessKey: '',
          secretKey: '',
          useSSL: false,
          defaultBucket: ''
        });

        setModals(prev => ({ ...prev, profileForm: false }));
        showToast('Profile added successfully');
      }
    });
  };

  const handleDeleteProfile = (profileId, e) => {
    e.stopPropagation(); // Avoid selecting it
    if (profileId === 'default') {
      showToast('Cannot delete default profile configured on the server', 'error');
      return;
    }
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    setConfirmState({
      title: 'Delete Connection Profile',
      message: `Are you sure you want to delete the profile "${profile.name}"? This will clear its credentials from local storage.`,
      actionLabel: 'Delete Profile',
      actionVariant: 'danger',
      onConfirm: () => {
        const updatedProfiles = profiles.filter(p => p.id !== profileId);
        setProfiles(updatedProfiles);

        // Save only custom profiles (not the 'default' config profile) to localStorage
        const customProfiles = updatedProfiles.filter(p => p.id !== 'default');
        localStorage.setItem('cinio_profiles', JSON.stringify(customProfiles));

        if (activeProfileId === profileId) {
          if (updatedProfiles.length > 0) {
            setActiveProfileId(updatedProfiles[0].id);
          } else {
            setActiveProfileId('');
            setModals(prev => ({ ...prev, profileForm: true }));
          }
        }
        showToast('Profile deleted');
      }
    });
  };

  // --- UTILITIES ---

  const getObjectUrl = (item, action = 'view') => {
    const profile = getActiveProfile();
    if (!profile || !activeBucket || !item) return '';

    const params = new URLSearchParams({
      bucket: activeBucket,
      name: item.name,
      action,
      endpoint: profile.endpoint,
      port: profile.port || '',
      useSSL: profile.useSSL ? 'true' : 'false',
      accessKey: profile.accessKey,
      secretKey: profile.secretKey
    });

    return `/api/minio/object?${params.toString()}`;
  };

  // Copy URL to Clipboard
  const handleCopyLink = async (item) => {
    // Generate a 24h signed link to share
    const profile = getActiveProfile();
    try {
      const query = new URLSearchParams({
        bucket: activeBucket,
        name: item.name,
        action: 'presigned'
      });
      const response = await fetch(`/api/minio/object?${query.toString()}`, {
        headers: getHeaders(profile)
      });
      const data = await response.json();
      if (data.success && data.url) {
        // Copy to clipboard
        navigator.clipboard.writeText(data.url);
        showToast('Temporary download link (valid 24h) copied to clipboard!');
      } else {
        showToast(`Failed to generate link: ${data.error}`, 'error');
      }
    } catch (e) {
      showToast(`Failed to copy link: ${e.message}`, 'error');
    }
  };

  // Get preview helper type
  const getPreviewType = (fileName) => {
    const cleanName = fileName.replace(/\/$/, '');
    const ext = cleanName.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
    const videoExts = ['mp4', 'webm', 'ogg', 'mov'];
    const audioExts = ['mp3', 'wav', 'ogg', 'aac'];
    const textExts = [
      'txt', 'md', 'html', 'css', 'js', 'jsx', 'ts', 'tsx', 'json', 'jsonl',
      'toml', 'xml', 'yaml', 'yml', 'env', 'conf', 'ini', 'sh', 'py', 'go',
      'rs', 'cpp', 'h', 'java', 'cs', 'php', 'rb', 'lock', 'config'
    ];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (textExts.includes(ext)) return 'text';
    return 'other';
  };

  const getFileIcon = (itemName, itemType) => {
    if (itemType === 'folder') return <Folder size={24} />;

    const cleanName = itemName.replace(/\/$/, '');
    const ext = cleanName.split('.').pop().toLowerCase();
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'];
    const videoExts = ['mp4', 'webm', 'ogg', 'mov'];
    const audioExts = ['mp3', 'wav', 'ogg', 'aac'];
    const codeExts = ['js', 'jsx', 'ts', 'tsx', 'json', 'jsonl', 'toml', 'xml', 'html', 'css', 'py', 'sh', 'go', 'rs', 'yaml', 'yml'];
    const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'];

    if (imageExts.includes(ext)) return <ImageIcon size={24} style={{ color: '#a78bfa' }} />;
    if (videoExts.includes(ext)) return <VideoIcon size={24} style={{ color: '#fb7185' }} />;
    if (audioExts.includes(ext)) return <Music size={24} style={{ color: '#38bdf8' }} />;
    if (codeExts.includes(ext)) return <Code size={24} style={{ color: '#34d399' }} />;
    if (docExts.includes(ext)) return <FileText size={24} style={{ color: '#fbbf24' }} />;
    return <File size={24} style={{ color: '#9ca3af' }} />;
  };

  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Breadcrumbs calculation
  const getBreadcrumbs = () => {
    const list = [{ name: 'Root', path: '' }];
    if (prefix) {
      const parts = prefix.split('/').filter(Boolean);
      let currentAccumulator = '';
      parts.forEach((part) => {
        currentAccumulator += part + '/';
        list.push({
          name: part,
          path: currentAccumulator
        });
      });
    }
    return list;
  };

  // Filter items in explorer
  const filteredItems = items.filter(item => {
    const matchSearch = item.displayName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSearch;
  });

  const activeProfile = getActiveProfile();

  const accentColors = getAccentColors(selectedItem);
  const containerStyle = {
    '--accent': accentColors.hex,
    '--accent-hover': accentColors.hover,
    '--accent-rgb': accentColors.rgb,
    '--shadow-accent': `0 0 20px 0 rgba(${accentColors.rgb}, 0.15)`,
    '--border-focus': `rgba(${accentColors.rgb}, 0.4)`
  };

  return (
    <div
      className="app-container"
      style={containerStyle}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {toast.type === 'success' && <Check size={18} style={{ color: 'var(--success)' }} />}
              {toast.type === 'error' && <X size={18} style={{ color: 'var(--danger)' }} />}
              <span>{toast.message}</span>
            </div>
            <button className="icon-btn-small" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}>
              <X size={14} style={{ color: 'var(--text-muted)' }} />
            </button>
          </div>
        ))}
      </div>

      {/* --- SIDEBAR PANEL --- */}
      <aside className="sidebar">

        {/* Logo Banner */}
        <div className="logo-section">
          <div className="logo-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Isometric Box / Bucket outer shell */}
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 7V17L12 22V12" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
              <path d="M22 7V17L12 22" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              
              {/* Floating Aperture / Eye inside representing vision in I/O */}
              <circle cx="12" cy="12" r="3.5" fill="var(--bg-secondary)" stroke="var(--accent)" strokeWidth="1.5"/>
              <circle cx="12" cy="12" r="1.2" fill="var(--accent)"/>
            </svg>
          </div>
          <div className="logo-text">
            <h1>
              <span>Cin</span>
              <span className="logo-accent">io</span>
            </h1>
            <p>see in io</p>
          </div>
        </div>

        {/* Sidebar Scrollable Body */}
        <div className="sidebar-scrollable">

          {/* Active Profile block */}
          <div>
            <div className="section-title">
              <span>Connection Profile</span>
              <button
                className="icon-btn-small"
                title="Add New Profile"
                onClick={() => setModals(prev => ({ ...prev, profileForm: true }))}
              >
                <Plus size={16} />
              </button>
            </div>

            {profiles.length === 0 ? (
              <div style={{
                padding: '16px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                border: '1px dashed var(--border-color)'
              }}>
                No profiles configured yet. Click the + button to create one.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {profiles.map(p => (
                  <div
                    key={p.id}
                    className={`profile-card ${p.id === activeProfileId ? 'active' : ''}`}
                    onClick={() => {
                      if (p.id !== activeProfileId) {
                        setPrefix('');
                        setSelectedItem(null);
                        setActiveBucket('');
                        setActiveProfileId(p.id);
                      }
                    }}
                  >
                    <div className="profile-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div className="profile-name">{p.name}</div>
                        {p.id === 'default' && (
                          <span style={{
                            fontSize: '9px',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            background: 'rgba(var(--accent-rgb), 0.15)',
                            color: 'var(--accent)',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(var(--accent-rgb), 0.2)'
                          }}>
                            Config
                          </span>
                        )}
                      </div>
                      <div className="profile-host">
                        {p.useSSL ? 'https://' : 'http://'}{p.endpoint}{p.port ? `:${p.port}` : ''}
                      </div>
                    </div>
                    {p.id !== 'default' ? (
                      <button
                        className="icon-btn-small"
                        title="Delete profile"
                        onClick={(e) => handleDeleteProfile(p.id, e)}
                        style={{ color: 'var(--text-muted)', opacity: 0.7 }}
                      >
                        <LogOut size={14} />
                      </button>
                    ) : (
                      <span title="Configured in config.json" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', opacity: 0.5, padding: '2px' }}>
                        <Server size={14} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Buckets Section */}
          {activeProfile && (
            <div>
              <div className="section-title">
                <span>Buckets</span>
                <button
                  className="icon-btn-small"
                  title="Create Bucket"
                  onClick={() => setModals(prev => ({ ...prev, createBucket: true }))}
                >
                  <Plus size={16} />
                </button>
              </div>

              {loading.buckets ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '12px', color: 'var(--text-muted)' }}>
                  <RefreshCw size={18} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                </div>
              ) : buckets.length === 0 ? (
                <div style={{
                  padding: '16px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  textAlign: 'center'
                }}>
                  No buckets found.
                </div>
              ) : (
                <div className="buckets-list">
                  {buckets.map(b => (
                    <div
                      key={b.name}
                      className={`bucket-item ${b.name === activeBucket ? 'active' : ''}`}
                      onClick={() => {
                        if (b.name !== activeBucket) {
                          setPrefix('');
                          setSelectedItem(null);
                          setActiveBucket(b.name);
                        }
                      }}
                    >
                      <div className="bucket-item-left">
                        <HardDrive size={16} />
                        <span className="bucket-name" title={b.name}>{b.name}</span>
                      </div>
                      {/* <div className="bucket-item-actions" onClick={e => e.stopPropagation()}>
                        <div className="item-dropdown-container">
                          <button
                            className="item-action-btn three-dots"
                            title="Bucket actions"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdownItem(activeDropdownItem === 'bucket:' + b.name ? null : 'bucket:' + b.name);
                            }}
                          >
                            <MoreVertical size={13} />
                          </button>

                          {activeDropdownItem === 'bucket:' + b.name && (
                            <div className="item-dropdown-menu" style={{ right: 0, minWidth: '120px' }}>
                              <button
                                className="dropdown-menu-item delete"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveDropdownItem(null);
                                  handleDeleteBucket(b.name);
                                }}
                              >
                                <Trash2 size={12} />
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div> */}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
            <Server size={14} />
            <span>MinIO Client GUI</span>
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            by Sai Uddisa
          </div>
        </div>
      </aside>

      {/* --- MAIN DISPLAY --- */}
      <main className="main-workspace">

        {/* Drag and Drop visual feedback overlay */}
        {isDragging && (
          <div className="drag-overlay">
            <Upload size={48} className="animate-bounce" style={{ color: 'var(--accent)', animation: 'bounce 1s infinite' }} />
            <div className="drag-overlay-text">Drop files to upload directly here</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Uploading to folder: {prefix || 'root'}</div>
          </div>
        )}

        {/* Top Header Explorer */}
        <div className="topbar">
          <div className="breadcrumbs">
            {activeBucket ? (
              getBreadcrumbs().map((b, idx, arr) => (
                <React.Fragment key={b.path}>
                  <span
                    className={`breadcrumb-item ${idx === arr.length - 1 ? 'active' : ''}`}
                    onClick={() => {
                      if (idx < arr.length - 1) {
                        setPrefix(b.path);
                        setSelectedItem(null);
                      }
                    }}
                  >
                    {idx === 0 && <HardDrive size={16} />}
                    {b.name}
                  </span>
                  {idx < arr.length - 1 && <ChevronRight size={14} className="breadcrumb-separator" />}
                </React.Fragment>
              ))
            ) : (
              <span className="breadcrumb-item active">Cinio Explorer</span>
            )}
          </div>

          <div className="topbar-actions">
            {activeBucket && (
              <>
                <button
                  className="btn btn-secondary"
                  onClick={fetchObjects}
                  title="Refresh items"
                  disabled={loading.items}
                >
                  <RefreshCw size={14} className={loading.items ? "animate-spin" : ""} style={loading.items ? { animation: 'spin 1.5s linear infinite' } : {}} />
                  Refresh
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setModals(prev => ({ ...prev, createFolder: true }))}
                >
                  <FolderPlus size={14} />
                  New Folder
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  <Upload size={14} />
                  Upload Files
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  style={{ display: 'none' }}
                />
              </>
            )}
          </div>
        </div>

        {/* Search bar & view selector */}
        {activeBucket && (
          <div className="search-container">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Search files in current folder..."
                className="search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="view-toggle">
              <button
                className={`view-toggle-btn ${viewType === 'grid' ? 'active' : ''}`}
                onClick={() => setViewType('grid')}
                title="Grid view"
              >
                <Grid size={16} />
              </button>
              <button
                className={`view-toggle-btn ${viewType === 'list' ? 'active' : ''}`}
                onClick={() => setViewType('list')}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Main Workspace Explorer Area */}
        <div className="explorer-content">

          {/* Case 1: No profiles exist */}
          {profiles.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Server size={36} />
              </div>
              <h3>Welcome to Cinio</h3>
              <p>
                A high-fidelity web client for exploring MinIO object storage. Set up your connection profile to begin browsing buckets, uploading files, and editing documents directly.
              </p>
              <button className="btn btn-primary" onClick={() => setModals(prev => ({ ...prev, profileForm: true }))}>
                Configure Your First Profile
              </button>
            </div>
          )}

          {/* Case 2: Profile exists, but no bucket selected */}
          {profiles.length > 0 && !activeBucket && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <HardDrive size={36} />
              </div>
              <h3>Select a Bucket</h3>
              <p>
                Connected to profile <strong>{activeProfile?.name}</strong>. Choose an existing bucket from the sidebar or create a new one to browse objects.
              </p>
              <button className="btn btn-primary" onClick={() => setModals(prev => ({ ...prev, createBucket: true }))}>
                Create New Bucket
              </button>
            </div>
          )}

          {/* Case 3: Bucket selected, loading items */}
          {activeBucket && loading.items && items.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
              <RefreshCw size={36} className="animate-spin" style={{ color: 'var(--accent)', animation: 'spin 1.5s linear infinite' }} />
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Listing objects from "{activeBucket}"...</div>
            </div>
          )}

          {/* Case 4: Bucket selected, empty listing */}
          {activeBucket && !loading.items && filteredItems.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Folder size={36} />
              </div>
              <h3>Folder is Empty</h3>
              <p>
                {searchQuery ? 'No files match your query.' : 'There are no objects in this path. Drag and drop files to upload, or create subfolders.'}
              </p>
              {!searchQuery && (
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={() => setModals(prev => ({ ...prev, createFolder: true }))}>
                    New Folder
                  </button>
                  <button className="btn btn-primary" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
                    Upload Files
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Case 5: Render items */}
          {activeBucket && filteredItems.length > 0 && (
            viewType === 'grid' ? (
              <div className="items-grid">

                {/* Back to Parent Directory (if not in root) */}
                {prefix && (
                  <div
                    className="item-card folder-card"
                    onClick={() => {
                      const parts = prefix.split('/').filter(Boolean);
                      parts.pop();
                      const parentPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
                      setPrefix(parentPrefix);
                      setSelectedItem(null);
                    }}
                  >
                    <div className="item-card-icon">
                      <ChevronLeft size={24} />
                    </div>
                    <div className="item-card-details">
                      <span className="item-card-name">..</span>
                      <span className="item-card-meta">Parent directory</span>
                    </div>
                  </div>
                )}

                {/* Display Folders & Files */}
                {filteredItems.map(item => (
                  <div
                    key={item.name}
                    className={`item-card ${item.type === 'folder' ? 'folder-card' : ''} ${selectedItem?.name === item.name ? 'selected' : ''}`}
                    onClick={() => handleViewFile(item)}
                    style={selectedItem?.name === item.name ? { borderColor: 'var(--accent)' } : {}}
                  >
                    <div className="item-card-icon">
                      {getFileIcon(item.name, item.type)}
                    </div>
                    <div className="item-card-details">
                      <span className="item-card-name" title={item.displayName}>{item.displayName}</span>
                      <span className="item-card-meta">
                        {item.type === 'folder' ? 'Folder' : formatBytes(item.size)}
                      </span>
                    </div>

                    {/* Hover Toolbar Action Buttons */}
                    <div className="item-card-actions" onClick={e => e.stopPropagation()}>
                      <div className="item-dropdown-container">
                        <button
                          className="item-action-btn three-dots"
                          title="More actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdownItem(activeDropdownItem === item.name ? null : item.name);
                          }}
                        >
                          <MoreVertical size={14} />
                        </button>

                        {activeDropdownItem === item.name && (
                          <div className="item-dropdown-menu">
                            {item.type === 'file' && (
                              <>
                                <button
                                  className="dropdown-menu-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdownItem(null);
                                    handleCopyLink(item);
                                  }}
                                >
                                  <Copy size={12} />
                                  Copy Link
                                </button>
                                <a
                                  className="dropdown-menu-item"
                                  href={getObjectUrl(item, 'download')}
                                  download={item.displayName}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdownItem(null);
                                  }}
                                >
                                  <Download size={12} />
                                  Download
                                </a>
                              </>
                            )}
                            <button
                              className="dropdown-menu-item delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownItem(null);
                                const isFolder = item.type === 'folder';
                                const folderCleanName = item.displayName.replace(/\/$/, '');
                                setConfirmState({
                                  title: isFolder ? 'Delete Folder' : 'Delete File',
                                  message: isFolder
                                    ? `Are you sure you want to delete the folder "${item.displayName}"? All files and subfolders inside it will be permanently deleted. This action is irreversible.`
                                    : `Are you sure you want to delete the file "${item.displayName}"?`,
                                  actionLabel: 'Delete',
                                  actionVariant: 'danger',
                                  showInput: isFolder,
                                  expectedInputValue: folderCleanName,
                                  inputPlaceholder: `Type ${folderCleanName} to confirm`,
                                  onConfirm: () => handleDeleteItem(item)
                                });
                              }}
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="items-list">

                {/* Back to Parent Directory Row */}
                {prefix && (
                  <div
                    className="item-list-row folder-row"
                    onClick={() => {
                      const parts = prefix.split('/').filter(Boolean);
                      parts.pop();
                      const parentPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
                      setPrefix(parentPrefix);
                      setSelectedItem(null);
                    }}
                  >
                    <div className="item-list-icon">
                      <ChevronLeft size={16} />
                    </div>
                    <div className="item-list-name">  .. </div>
                    <div></div>
                    <div></div>
                  </div>
                )}

                {/* Listing rows */}
                {filteredItems.map(item => (
                  <div
                    key={item.name}
                    className={`item-list-row ${item.type === 'folder' ? 'folder-row' : ''}`}
                    onClick={() => handleViewFile(item)}
                    style={selectedItem?.name === item.name ? { borderColor: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.03)' } : {}}
                  >
                    <div className="item-list-icon">
                      {getFileIcon(item.name, item.type)}
                    </div>

                    <div className="item-list-name" title={item.displayName}>
                      {item.displayName}
                    </div>

                    <div className="item-list-size">
                      {item.type === 'folder' ? '--' : formatBytes(item.size)}
                    </div>

                    <div className="item-list-date">
                      {item.type === 'folder' ? 'Folder' : formatDate(item.lastModified)}
                    </div>

                    {/* Inline actions */}
                    <div className="item-list-actions" onClick={e => e.stopPropagation()}>
                      <div className="item-dropdown-container">
                        <button
                          className="item-action-btn three-dots"
                          title="More actions"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdownItem(activeDropdownItem === item.name ? null : item.name);
                          }}
                        >
                          <MoreVertical size={14} />
                        </button>

                        {activeDropdownItem === item.name && (
                          <div className="item-dropdown-menu">
                            {item.type === 'file' && (
                              <>
                                <button
                                  className="dropdown-menu-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdownItem(null);
                                    handleCopyLink(item);
                                  }}
                                >
                                  <Copy size={12} />
                                  Copy Link
                                </button>
                                <a
                                  className="dropdown-menu-item"
                                  href={getObjectUrl(item, 'download')}
                                  download={item.displayName}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveDropdownItem(null);
                                  }}
                                >
                                  <Download size={12} />
                                  Download
                                </a>
                              </>
                            )}
                            <button
                              className="dropdown-menu-item delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveDropdownItem(null);
                                const isFolder = item.type === 'folder';
                                const folderCleanName = item.displayName.replace(/\/$/, '');
                                setConfirmState({
                                  title: isFolder ? 'Delete Folder' : 'Delete File',
                                  message: isFolder
                                    ? `Are you sure you want to delete the folder "${item.displayName}"? All files and subfolders inside it will be permanently deleted. This action is irreversible.`
                                    : `Are you sure you want to delete the file "${item.displayName}"?`,
                                  actionLabel: 'Delete',
                                  actionVariant: 'danger',
                                  showInput: isFolder,
                                  expectedInputValue: folderCleanName,
                                  inputPlaceholder: `Type ${folderCleanName} to confirm`,
                                  onConfirm: () => handleDeleteItem(item)
                                });
                              }}
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* --- DYNAMIC SLIDE-IN SIDE PANEL (Viewer & Editor) --- */}
        {selectedItem && (
          <div className="viewer-panel">
            <div className="viewer-header">
              <div className="viewer-title">
                <span className="viewer-filename" title={selectedItem.displayName}>
                  {selectedItem.displayName}
                </span>
                <span className="viewer-meta">
                  {selectedItem.type === 'folder' ? 'Folder' : `${formatBytes(selectedItem.size)} • ${selectedItem.name}`}
                </span>
              </div>
              <div className="viewer-actions">
                {selectedItem.type === 'file' && (
                  <>
                    <a
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '13px', textDecoration: 'none' }}
                      href={getObjectUrl(selectedItem, 'download')}
                      download={selectedItem.displayName}
                    >
                      <Download size={14} />
                      Download
                    </a>
                    {getPreviewType(selectedItem.name) === 'text' && (
                      <button
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '13px' }}
                        onClick={handleSaveTextFile}
                        disabled={!isEditorDirty || isSavingFile}
                      >
                        {isSavingFile ? (
                          <RefreshCw size={14} className="animate-spin" style={{ animation: 'spin 1.5s linear infinite' }} />
                        ) : (
                          <Check size={14} />
                        )}
                        Save Edits
                      </button>
                    )}
                  </>
                )}
                <button className="modal-close" onClick={() => setSelectedItem(null)}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="viewer-body">
              {loading.operation ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ color: 'var(--accent)', animation: 'spin 1.5s linear infinite' }} />
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Reading file content...</span>
                </div>
              ) : selectedItem.type === 'file' ? (
                (() => {
                  if (previewError) {
                    return (
                      <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px 24px' }}>
                        <FileText size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
                        <p style={{ fontWeight: 500, color: 'var(--text-primary)' }}>Unable to load preview inline</p>
                        <p style={{ fontSize: '13px', marginTop: '6px', color: 'var(--text-muted)' }}>This file cannot be previewed directly due to format, CORS, or storage limits.</p>
                        <a
                          className="btn btn-primary"
                          style={{ marginTop: '20px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', margin: '20px auto 0' }}
                          href={getObjectUrl(selectedItem, 'download')}
                          download={selectedItem.displayName}
                        >
                          <Download size={14} />
                          Download File
                        </a>
                      </div>
                    );
                  }

                  const type = getPreviewType(selectedItem.name);
                  if (type === 'pdf') {
                    return (
                      <iframe
                        src={getObjectUrl(selectedItem, 'view')}
                        className="media-preview-pdf"
                        title={selectedItem.displayName}
                      />
                    );
                  }
                  if (type === 'image') {
                    return (
                      <img
                        src={getObjectUrl(selectedItem, 'view')}
                        alt={selectedItem.displayName}
                        className="media-preview-img"
                        onError={() => setPreviewError(true)}
                      />
                    );
                  }
                  if (type === 'video') {
                    return (
                      <video
                        src={getObjectUrl(selectedItem, 'view')}
                        className="media-preview-player"
                        controls
                        onError={() => setPreviewError(true)}
                      />
                    );
                  }
                  if (type === 'audio') {
                    return (
                      <audio
                        src={getObjectUrl(selectedItem, 'view')}
                        className="media-preview-player"
                        controls
                        onError={() => setPreviewError(true)}
                      />
                    );
                  }
                  if (type === 'text') {
                    return (
                      <div className="text-editor-container">
                        <div className="editor-toolbar">
                          <span>UTF-8 Document Editor</span>
                          <span>{isEditorDirty ? '• Unsaved Changes' : 'Saved'}</span>
                        </div>
                        <textarea
                          className="editor-textarea"
                          value={editorContent}
                          onChange={(e) => {
                            setEditorContent(e.target.value);
                            setIsEditorDirty(true);
                          }}
                        />
                      </div>
                    );
                  }
                  return (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
                      <FileText size={48} style={{ margin: '0 auto 16px', color: 'var(--text-muted)' }} />
                      <p style={{ fontWeight: 500, color: 'var(--text-primary)' }}>No direct preview available</p>
                      <p style={{ fontSize: '13px', marginTop: '6px' }}>This binary file type cannot be rendered inline.</p>
                      <a
                        className="btn btn-primary"
                        style={{ marginTop: '16px', textDecoration: 'none' }}
                        href={getObjectUrl(selectedItem, 'download')}
                      >
                        <Download size={14} />
                        Download File
                      </a>
                    </div>
                  );
                })()
              ) : null}
            </div>
          </div>
        )}

      </main>

      {/* --- MODAL DIALOGS --- */}

      {/* 1. Add Connection Profile Modal */}
      {modals.profileForm && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleAddProfile}>
            <div className="modal-header">
              <h3>Configure Connection Profile</h3>
              {profiles.length > 0 && (
                <button type="button" className="modal-close" onClick={() => setModals(prev => ({ ...prev, profileForm: false }))}>
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Profile Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Local Dev Server"
                  required
                  value={newProfile.name}
                  onChange={(e) => setNewProfile(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Endpoint (Host)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 127.0.0.1 or play.min.io"
                    required
                    value={newProfile.endpoint}
                    onChange={(e) => setNewProfile(prev => ({ ...prev, endpoint: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Port</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="9000"
                    value={newProfile.port}
                    onChange={(e) => setNewProfile(prev => ({ ...prev, port: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Access Key</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="MinIO Access Key"
                  required
                  value={newProfile.accessKey}
                  onChange={(e) => setNewProfile(prev => ({ ...prev, accessKey: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Secret Key</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="MinIO Secret Key"
                  required
                  value={newProfile.secretKey}
                  onChange={(e) => setNewProfile(prev => ({ ...prev, secretKey: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Default Bucket (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Bucket to open automatically"
                  value={newProfile.defaultBucket}
                  onChange={(e) => setNewProfile(prev => ({ ...prev, defaultBucket: e.target.value }))}
                />
              </div>

              <div className="form-group checkbox">
                <input
                  type="checkbox"
                  id="useSSL"
                  checked={newProfile.useSSL}
                  onChange={(e) => setNewProfile(prev => ({ ...prev, useSSL: e.target.checked }))}
                />
                <label htmlFor="useSSL" className="form-label" style={{ cursor: 'pointer' }}>Use SSL (Secure connection / HTTPS)</label>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={testConnection}
                disabled={loading.test}
                style={{ marginRight: 'auto' }}
              >
                {loading.test ? 'Testing...' : 'Test Connection'}
              </button>

              {profiles.length > 0 && (
                <button type="button" className="btn btn-secondary" onClick={() => setModals(prev => ({ ...prev, profileForm: false }))}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn btn-primary">
                Save Profile
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Create Bucket Modal */}
      {modals.createBucket && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleCreateBucket}>
            <div className="modal-header">
              <h3>Create New Bucket</h3>
              <button type="button" className="modal-close" onClick={() => setModals(prev => ({ ...prev, createBucket: false }))}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Bucket Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. user-uploads"
                  required
                  pattern="^[a-z0-9.-]{3,63}$"
                  title="3-63 chars, lowercase, numbers, dots, and dashes only"
                  value={newBucketName}
                  onChange={(e) => setNewBucketName(e.target.value)}
                  autoFocus
                />
                <span className="form-help">Must be 3-63 characters, lowercase letters, numbers, dots, or dashes only.</span>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModals(prev => ({ ...prev, createBucket: false }))}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading.operation}>
                {loading.operation ? 'Creating...' : 'Create Bucket'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. Create Folder Modal */}
      {modals.createFolder && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleCreateFolder}>
            <div className="modal-header">
              <h3>Create Folder</h3>
              <button type="button" className="modal-close" onClick={() => setModals(prev => ({ ...prev, createFolder: false }))}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Folder Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. documents"
                  required
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                />
                <span className="form-help">Creates a virtual directory structure in the current path.</span>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModals(prev => ({ ...prev, createFolder: false }))}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading.operation}>
                {loading.operation ? 'Creating...' : 'Create Folder'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Universal Confirmation Modal */}
      {confirmState && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: confirmState.actionVariant === 'danger' ? 'var(--danger)' :
                  confirmState.actionVariant === 'success' ? 'var(--success)' : 'var(--accent)'
              }}>
                {confirmState.actionVariant === 'danger' ? <AlertTriangle size={18} /> : <Info size={18} />}
                {confirmState.title}
              </h3>
              <button className="modal-close" onClick={() => {
                setConfirmState(null);
                setConfirmInputText('');
              }}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-primary)' }}>
                {confirmState.message}
              </p>

              {confirmState.showInput && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Type <strong>{confirmState.expectedInputValue}</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={confirmInputText}
                    onChange={(e) => setConfirmInputText(e.target.value)}
                    placeholder={confirmState.inputPlaceholder || "Type here"}
                    autoFocus
                  />
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setConfirmState(null);
                setConfirmInputText('');
              }}>
                Cancel
              </button>
              <button
                className={`btn btn-${confirmState.actionVariant || 'primary'}`}
                onClick={async () => {
                  const onConfirmCallback = confirmState.onConfirm;
                  setConfirmState(null);
                  setConfirmInputText('');
                  await onConfirmCallback();
                }}
                disabled={
                  loading.operation ||
                  (confirmState.showInput && confirmInputText !== confirmState.expectedInputValue)
                }
              >
                {loading.operation ? 'Processing...' : (confirmState.actionLabel || 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Upload Progress Overlay */}
      {uploadStatus.isUploading && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '400px', padding: '24px', textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <RefreshCw size={36} className="animate-spin" style={{ color: 'var(--accent)', animation: 'spin 1.5s linear infinite' }} />
                <Upload size={16} style={{ position: 'absolute', color: 'var(--text-primary)' }} />
              </div>

              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px' }}>
                  {uploadStatus.uploadedCount === uploadStatus.totalFiles ? 'Upload Complete!' : 'Uploading Files...'}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', wordBreak: 'break-all', minHeight: '20px' }}>
                  {uploadStatus.uploadedCount === uploadStatus.totalFiles
                    ? 'Refreshing explorer...'
                    : `Uploading: ${uploadStatus.currentFileName}`
                  }
                </p>
              </div>

              {/* Progress Bar Container */}
              <div style={{ width: '100%', background: 'var(--bg-tertiary)', height: '8px', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <div style={{
                  width: `${(uploadStatus.uploadedCount / uploadStatus.totalFiles) * 100}%`,
                  background: 'linear-gradient(to right, rgba(var(--accent-rgb), 0.6), var(--accent))',
                  height: '100%',
                  borderRadius: '4px',
                  transition: 'width 0.3s ease'
                }} />
              </div>

              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)' }}>
                {uploadStatus.uploadedCount} of {uploadStatus.totalFiles} files uploaded
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
