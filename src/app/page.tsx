'use client';

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Upload, Download, Loader2, Printer, Coins, Image as ImageIcon, X, User, QrCode, Hash, Shield, LogOut, Plus } from "lucide-react";
import axios from "axios";
import Barcode from "react-barcode";
import { signOut, useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

import html2canvas from 'html2canvas-pro';
import jsPDF from 'jspdf';
import JSZip from 'jszip';
import Image from "next/image";

interface UserPoints {
  points: number;
}

// Validation function to check if any required field is null
const validateExtractedData = (data: any): boolean => {
  const requiredFields = [
    'english_name',
    'english_nationality',
    'english_gender',
    'english_sub_city',
    'english_city',
    'english_woreda',
    'birth_date_ethiopian',
    'birth_date_gregorian',
    'amharic_gender',
    'amharic_city',
    'amharic_sub_city',
    'amharic_nationality',
    'amharic_name',
    'amharic_woreda',
    'issue_date_gregorian',
    'issue_date_ethiopian',
    'phone_number',
    'expiry_date_gregorian',
    'expiry_date_ethiopian',
    'fcn_id',
    'fin_number',
    'images'
  ];

  for (const field of requiredFields) {
    if (!data[field]) {
      console.error(`Missing required field: ${field}`);
      return false;
    }
  }

  // Additional validation for images array
  if (!Array.isArray(data.images) || data.images.length === 0) {
    console.error('Images array is missing or empty');
    return false;
  }

  return true;
};

// Helper function to transform remote image URLs to proxied URLs
const transformImageUrl = (url: string | undefined): string => {
  if (!url) return '';
  // Handle absolute URLs
  if (url.startsWith('https://api.affiliate.pro.et/images/')) {
    return url.replace('https://api.affiliate.pro.et/images/', '/remote-images/');
  }
  // Handle relative paths that start with 'images/'
  if (url.startsWith('images/')) {
    return url.replace('images/', '/remote-images/');
  }
  return url;
};

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [allExtractedData, setAllExtractedData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userPoints, setUserPoints] = useState<UserPoints | null>(null);
  const [pointsLoading, setPointsLoading] = useState(true);
  const [customFrontTemplate, setCustomFrontTemplate] = useState<string | null>(null);
  const [customBackTemplate, setCustomBackTemplate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pdf' | 'screenshot'>('pdf');
  const [screenshotFiles, setScreenshotFiles] = useState<(File | null)[]>([null, null, null]);
  const [isMultiScreenshotMode, setIsMultiScreenshotMode] = useState(false);
  const [multiScreenshotSets, setMultiScreenshotSets] = useState<(File | null)[][]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const session = useSession()
  const user = session?.data?.user;

  const fetchUserPoints = async () => {
    try {
      setPointsLoading(true);
      const response = await fetch('/api/points', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUserPoints(data);
      }
    } catch (error) {
      console.error('Error fetching user points:', error);
    } finally {
      setPointsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      fetchUserPoints();
    }
  }, [user?.id]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFilesSelection(droppedFiles);
  };

  const handleScreenshotDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleScreenshotDrop = (e: React.DragEvent, imageIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const newFiles = [...screenshotFiles];
        newFiles[imageIndex] = file;
        setScreenshotFiles(newFiles);
      } else {
        setError('Please drop an image file');
      }
    }
  };

  const addScreenshotSet = () => {
    if (multiScreenshotSets.length < 5) {
      setMultiScreenshotSets([...multiScreenshotSets, [null, null, null]]);
    } else {
      setError('Maximum 5 ID cards allowed');
    }
  };

  const removeScreenshotSet = (index: number) => {
    setMultiScreenshotSets(multiScreenshotSets.filter((_, i) => i !== index));
  };

  const updateScreenshotSet = (setIndex: number, imageIndex: number, file: File | null) => {
    const newSets = [...multiScreenshotSets];
    newSets[setIndex][imageIndex] = file;
    setMultiScreenshotSets(newSets);
  };

  const handleMultiScreenshotDrop = (e: React.DragEvent, setIndex: number, imageIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        updateScreenshotSet(setIndex, imageIndex, file);
      } else {
        setError('Please drop an image file');
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files ? Array.from(e.target.files) : [];
    handleFilesSelection(selectedFiles);
  };

  const handleFilesSelection = (selectedFiles: File[]) => {
    if (selectedFiles.length > 5) {
      setError("You can only upload up to 5 PDF files at once.");
      return;
    }

    const validFiles: File[] = [];
    let hasInvalid = false;

    for (const file of selectedFiles) {
      if (file.type === 'application/pdf') {
        validFiles.push(file);
      } else {
        hasInvalid = true;
      }
    }

    if (hasInvalid) {
      setError('Some files were ignored because they are not PDFs.');
    } else {
      setError(null);
    }

    setFiles(validFiles);
    // Reset data when new files are selected
    setAllExtractedData([]);
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (type === 'front') {
        setCustomFrontTemplate(result);
      } else {
        setCustomBackTemplate(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const removeCustomTemplate = (type: 'front' | 'back') => {
    if (type === 'front') {
      setCustomFrontTemplate(null);
    } else {
      setCustomBackTemplate(null);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) {
      setError("Please select at least one PDF file");
      return;
    }

    if (userPoints && userPoints.points < files.length) {
      setError(`Insufficient points. You need ${files.length} points for ${files.length} files.`);
      return;
    }

    setLoading(true)
    setError(null);
    setAllExtractedData([]);

    const newExtractedData: any[] = [];
    const errors: string[] = [];

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        try {
          const response = await axios.post("/api/process-pdf", formData, {
            headers: {
              "Content-Type": "multipart/form-data",
            }
          });

          if (response.data.success) {
            if (validateExtractedData(response.data)) {
              newExtractedData.push(response.data);
            } else {
              errors.push(`Invalid PDF content in ${file.name}`);
            }
          } else {
            errors.push(`Failed to process ${file.name}: ${response.data.message || "Unknown error"}`);
          }
        } catch (err: any) {
          console.error(`Error processing ${file.name}:`, err);
          errors.push(`Error processing ${file.name}: ${err.message}`);
        }
      }

      if (newExtractedData.length > 0) {
        // Transform image URLs to bypass CORS
        const transformedData = newExtractedData.map(data => ({
          ...data,
          images: data.images?.map((img: string) => transformImageUrl(img))
        }));
        setAllExtractedData(transformedData);
        fetchUserPoints();
      }

      if (errors.length > 0) {
        setError(errors.join(". "));
      }

    } catch (err: any) {
      console.error("Upload error:", err);
      setError("Global upload failed. Please try again.");
    } finally {
      setLoading(false)
    }
  }

  async function handleScreenshotUpload(e: React.FormEvent) {
    e.preventDefault();

    if (isMultiScreenshotMode) {
      // Multi-ID mode validation
      if (multiScreenshotSets.length === 0) {
        setError("Please add at least one ID card set.");
        return;
      }

      const validSets = multiScreenshotSets.filter(set => set[1] && set[2]);
      if (validSets.length === 0) {
        setError("Each ID card set must have Image 2 and Image 3.");
        return;
      }

      if (userPoints && userPoints.points < validSets.length) {
        setError(`Insufficient points. You need ${validSets.length} points for ${validSets.length} ID cards.`);
        return;
      }

      setLoading(true);
      setError(null);
      setAllExtractedData([]);

      try {
        const newExtractedData: any[] = [];

        for (let i = 0; i < multiScreenshotSets.length; i++) {
          const screenshotSet = multiScreenshotSets[i];
          if (!screenshotSet[1] || !screenshotSet[2]) continue; // Skip incomplete sets

          const formData = new FormData();
          if (screenshotSet[0]) formData.append("image1", screenshotSet[0]);
          formData.append("image2", screenshotSet[1]!);
          formData.append("image3", screenshotSet[2]!);

          try {
            const response = await axios.post("/api/process-screenshots", formData, {
              headers: {
                "Content-Type": "multipart/form-data",
              }
            });

            if (response.data.success) {
              if (response.data) {
                const transformedData = {
                  ...response.data,
                  images: response.data.images?.map((img: string) => transformImageUrl(img))
                };
                newExtractedData.push(transformedData);
              }
            }
          } catch (err) {
            console.error(`Error processing ID set ${i + 1}:`, err);
          }
        }

        if (newExtractedData.length > 0) {
          setAllExtractedData(newExtractedData);
          fetchUserPoints();
        } else {
          setError("Failed to process any ID cards. Please check your images and try again.");
        }
      } catch (err: any) {
        console.error("Multi-screenshot upload error:", err);
        setError("Batch processing failed. Please try again.");
      } finally {
        setLoading(false);
      }
    } else {
      // Single ID mode (original logic)
      const [, img2, img3] = screenshotFiles;
      if (!img2 || !img3) {
        setError("Image 2 and Image 3 are mandatory.");
        return;
      }

      if (userPoints && userPoints.points < 1) {
        setError(`Insufficient points. You need 1 point to process screenshots.`);
        return;
      }

      setLoading(true);
      setError(null);
      setAllExtractedData([]);

      try {
        const formData = new FormData();
        if (screenshotFiles[0]) formData.append("image1", screenshotFiles[0]);
        formData.append("image2", screenshotFiles[1]!);
        formData.append("image3", screenshotFiles[2]!);

        const response = await axios.post("/api/process-screenshots", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          }
        });

        if (response.data.success) {
          if (response.data) {
            const transformedData = {
              ...response.data,
              images: response.data.images?.map((img: string) => transformImageUrl(img))
            };
            setAllExtractedData([transformedData]);
            fetchUserPoints();
          } else {
            setError("Invalid data extracted from screenshots.");
          }
        } else {
          setError(response.data.message || "Failed to process screenshots.");
        }
      } catch (err: any) {
        console.error("Screenshot upload error:", err);
        setError(err.response?.data?.message || "Screenshot processing failed. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-8 p-6 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-blue-100/50">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-2">
              Welcome back, <span className="text-lg lg:text-2xl text-blue-600">{user?.email}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-4">
              {userPoints && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-full border border-amber-200">
                  <Coins className="h-5 w-5 text-amber-600" />
                  <span className="font-semibold text-amber-700">{userPoints.points} points available</span>
                </div>
              )}
              {pointsLoading && (
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-full">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                  <span className="text-slate-600">Loading points...</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {user?.id === "A6uihg20B1gGIhrMp3Z7rwrLXCUEgfko" && (
              <Button
                onClick={() => router.push("/add-points")}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Points
              </Button>
            )}
            <Button
              onClick={() => signOut({
                fetchOptions: {
                  onSuccess: () => {
                    router.push("/login");
                  },
                },
              })}
              variant="outline"
              className="flex items-center gap-2 border-red-200 text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        {/* Main Card */}
        <Card className="shadow-xl border-blue-100/50 backdrop-blur-sm bg-white/90">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-slate-800">
                  Ethiopian ID Card Data Extractor
                </CardTitle>
                <CardDescription className="text-slate-600 mt-1">
                  Upload a PDF file to extract Ethiopian ID card information and generate ID cards
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-8">


            {/* Tab Switcher */}
            <div className="flex p-1 bg-slate-100 rounded-xl mb-6 w-fit mx-auto">
              <button
                onClick={() => setActiveTab('pdf')}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'pdf'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
                  }`}
              >
                Upload PDF
              </button>
              <button
                onClick={() => setActiveTab('screenshot')}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${activeTab === 'screenshot'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
                  }`}
              >
                Upload Screenshot
              </button>
            </div>

            {/* Upload Section */}
            <div className="space-y-6">
              {activeTab === 'pdf' ? (
                <form onSubmit={handleUpload} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="pdf-upload" className="text-slate-700 font-medium text-lg">
                      Select PDF Files (Max 5)
                    </Label>

                    {/* Drag and Drop Area */}
                    <div
                      className={`border-2 border-dashed rounded-xl p-2 text-center cursor-pointer transition-all duration-200 ${isDragOver
                        ? 'border-blue-400 bg-blue-50'
                        : 'border-blue-200 hover:border-blue-400 bg-blue-25'
                        }`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="flex flex-col items-center justify-center gap-4">
                        <Upload className="h-12 w-12 text-blue-400" />
                        <div className="space-y-2">
                          <p className="text-lg font-medium text-slate-700">
                            Drag and drop your PDF files here
                          </p>
                          <p className="text-sm text-slate-500">
                            or click to browse
                          </p>
                        </div>

                        {/* File List Display */}
                        {files.length > 0 && (
                          <div className="mt-4 w-full px-8">
                            <ul className="space-y-2">
                              {files.map((f, i) => (
                                <li key={i} className="flex justify-between items-center bg-green-50 p-3 rounded-lg border border-green-200">
                                  <span className="text-green-700 font-medium truncate max-w-[80%]">{f.name}</span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                                    className="text-red-500 hover:bg-red-100 hover:text-red-700 h-8 w-8 p-0"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </li>
                              ))}
                            </ul>
                            <p className="text-right text-xs text-slate-500 mt-2">{files.length} / 5 files selected</p>
                          </div>
                        )}
                      </div>

                      <Input
                        ref={fileInputRef}
                        id="pdf-upload"
                        type="file"
                        accept="application/pdf"
                        multiple
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={files.length === 0 || loading}
                      className="w-full bg-blue-600 mt-4 hover:bg-blue-700 text-white px-8 py-6 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/25"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          Processing {files.length} PDF(s)...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-3 h-5 w-5" />
                          Extract Data from {files.length > 0 ? files.length : ''} File(s)
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleScreenshotUpload} className="space-y-6">
                  <div className="text-center space-y-2 mb-8">
                    <h2 className="text-xl font-bold text-slate-800">
                      Upload Screenshots from the Fayda App
                    </h2>
                    <p className="text-slate-500 text-sm">
                      Image 2 (front card) and Image 3 (back card) are required. Image 1 (popup) is optional for colored photo.
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-4">
                      <Label className="text-sm font-medium text-slate-700">Single ID</Label>
                      <button
                        type="button"
                        onClick={() => setIsMultiScreenshotMode(!isMultiScreenshotMode)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          isMultiScreenshotMode ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            isMultiScreenshotMode ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <Label className="text-sm font-medium text-slate-700">Multiple IDs</Label>
                    </div>
                    {isMultiScreenshotMode && (
                      <p className="text-xs text-blue-600 mt-2">
                        Enable multiple ID mode to process several ID cards at once (1 point per ID)
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[1, 2, 3].map((num) => (
                      <div key={num} className="space-y-4">
                        <div className="text-center space-y-1">
                          <Label className="text-teal-600 font-bold text-base block">
                            Image {num} {num === 1 ? '(Optional)' : ''}
                          </Label>
                          <p className="text-slate-500 text-xs">
                            {num === 1 ? 'Photo + QR Popup (for colored photo)' :
                              num === 2 ? 'Front of ID Card' :
                                'Back of ID Card'}
                          </p>
                        </div>
                        <div
                          className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 h-56 flex flex-col items-center justify-center ${screenshotFiles[num - 1]
                            ? 'border-green-200 bg-green-50'
                            : 'border-blue-100 hover:border-blue-300 bg-slate-50/50'
                            }`}
                          onClick={() => document.getElementById(`screenshot-${num}`)?.click()}
                          onDragOver={(e) => handleScreenshotDragOver(e)}
                          onDrop={(e) => handleScreenshotDrop(e, num - 1)}
                        >
                          {screenshotFiles[num - 1] ? (
                            <div className="w-full h-full relative">
                              <Image
                                src={URL.createObjectURL(screenshotFiles[num - 1]!)}
                                alt={`Screenshot ${num}`}
                                fill
                                className="object-contain"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newFiles = [...screenshotFiles];
                                  newFiles[num - 1] = null;
                                  setScreenshotFiles(newFiles);
                                }}
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 z-10"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex gap-1 mb-4">
                                <Upload className="h-6 w-6 text-blue-200" />

                              </div>
                              <div className="bg-slate-200/50 shadow-sm px-6 py-2 rounded-lg text-slate-700 font-medium text-sm hover:bg-slate-200 transition-colors">
                                Select
                              </div>
                            </>
                          )}
                          <Input
                            id={`screenshot-${num}`}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              const newFiles = [...screenshotFiles];
                              newFiles[num - 1] = file;
                              setScreenshotFiles(newFiles);
                            }}
                            className="hidden"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Multi-ID Mode Interface */}
                  {isMultiScreenshotMode && (
                    <div className="space-y-6 border-t border-blue-100 pt-6">
                      <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-slate-800">
                          Multiple ID Cards ({multiScreenshotSets.length}/5)
                        </h3>
                        <Button
                          type="button"
                          onClick={addScreenshotSet}
                          disabled={multiScreenshotSets.length >= 5}
                          className="bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                        >
                          <Plus className="h-4 w-4" />
                          Add ID Card
                        </Button>
                      </div>

                      {multiScreenshotSets.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-blue-200 rounded-xl">
                          <p className="text-slate-500">Click "Add ID Card" to start adding multiple ID cards</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {multiScreenshotSets.map((screenshotSet, setIndex) => (
                            <div key={setIndex} className="border rounded-xl p-4 bg-slate-50">
                              <div className="flex justify-between items-center mb-4">
                                <h4 className="font-semibold text-slate-700">ID Card {setIndex + 1}</h4>
                                <Button
                                  type="button"
                                  onClick={() => removeScreenshotSet(setIndex)}
                                  variant="outline"
                                  size="sm"
                                  className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[1, 2, 3].map((num) => (
                                  <div key={num} className="space-y-2">
                                    <div className="text-center space-y-1">
                                      <Label className="text-teal-600 font-bold text-sm block">
                                        Image {num} {num === 1 ? '(Optional)' : ''}
                                      </Label>
                                      <p className="text-slate-500 text-xs">
                                        {num === 1 ? 'Photo + QR Popup' :
                                          num === 2 ? 'Front of ID Card' :
                                            'Back of ID Card'}
                                      </p>
                                    </div>
                                    <div
                                      className={`relative border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-all duration-200 h-48 flex flex-col items-center justify-center ${screenshotSet[num - 1]
                                        ? 'border-green-200 bg-green-50'
                                        : 'border-blue-100 hover:border-blue-300 bg-slate-50/50'
                                        }`}
                                      onClick={() => document.getElementById(`multi-screenshot-${setIndex}-${num}`)?.click()}
                                      onDragOver={(e) => handleScreenshotDragOver(e)}
                                      onDrop={(e) => handleMultiScreenshotDrop(e, setIndex, num - 1)}
                                    >
                                      {screenshotSet[num - 1] ? (
                                        <div className="w-full h-full relative">
                                          <Image
                                            src={URL.createObjectURL(screenshotSet[num - 1]!)}
                                            alt={`ID ${setIndex + 1} - Image ${num}`}
                                            fill
                                            className="object-contain"
                                          />
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              updateScreenshotSet(setIndex, num - 1, null);
                                            }}
                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 z-10"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <Upload className="h-5 w-5 text-blue-200 mb-2" />
                                          <div className="bg-slate-200/50 shadow-sm px-4 py-1 rounded-lg text-slate-700 font-medium text-xs hover:bg-slate-200 transition-colors">
                                            Select
                                          </div>
                                        </>
                                      )}
                                      <Input
                                        id={`multi-screenshot-${setIndex}-${num}`}
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0] || null;
                                          updateScreenshotSet(setIndex, num - 1, file);
                                        }}
                                        className="hidden"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview All Uploaded IDs */}
                  {isMultiScreenshotMode && multiScreenshotSets.some(set => set.some(file => file !== null)) && (
                    <div className="space-y-4 border-t border-blue-100 pt-6">
                      <h3 className="text-lg font-semibold text-slate-800">Preview All Uploaded IDs</h3>
                      <div className="space-y-4">
                        {multiScreenshotSets.map((screenshotSet, setIndex) => {
                          const hasImages = screenshotSet.some(file => file !== null);
                          if (!hasImages) return null;
                          
                          return (
                            <div key={setIndex} className="border rounded-xl p-4 bg-blue-50/30">
                              <h4 className="font-semibold text-slate-700 mb-3">ID Card {setIndex + 1}</h4>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {[1, 2, 3].map((num) => (
                                  <div key={num} className="space-y-2">
                                    <div className="text-center">
                                      <Label className="text-teal-600 font-bold text-sm">
                                        Image {num} {num === 1 ? '(Optional)' : ''}
                                      </Label>
                                    </div>
                                    {screenshotSet[num - 1] ? (
                                      <div className="relative h-32 border rounded-lg overflow-hidden bg-white">
                                        <Image
                                          src={URL.createObjectURL(screenshotSet[num - 1]!)}
                                          alt={`ID ${setIndex + 1} - Image ${num}`}
                                          fill
                                          className="object-contain"
                                        />
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-2">
                                          <p className="text-white text-xs font-medium">
                                            {num === 1 ? 'Photo + QR' :
                                             num === 2 ? 'Front' : 'Back'}
                                          </p>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="h-32 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center bg-gray-50">
                                        <p className="text-gray-400 text-xs">No image</p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${
                                  screenshotSet[1] && screenshotSet[2] ? 'bg-green-500' : 'bg-yellow-500'
                                }`} />
                                <span className="text-sm text-slate-600">
                                  {screenshotSet[1] && screenshotSet[2] ? 'Ready to process' : 'Missing required images'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-700">
                          <strong>Total IDs ready:</strong> {multiScreenshotSets.filter(set => set[1] && set[2]).length} / {multiScreenshotSets.length}
                        </p>
                        <p className="text-xs text-blue-600 mt-1">
                          Each ID requires Image 2 (Front) and Image 3 (Back) to be processed
                        </p>
                      </div>
                    </div>
                  )}

                  <Button
                    type="submit"
                    disabled={
                      isMultiScreenshotMode 
                        ? (multiScreenshotSets.length === 0 || multiScreenshotSets.every(set => !set[1] || !set[2]) || loading)
                        : (!screenshotFiles[1] || !screenshotFiles[2] || loading)
                    }
                    className="w-full bg-blue-600 mt-4 hover:bg-blue-700 text-white px-8 py-6 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/25"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                        {isMultiScreenshotMode ? 'Processing Multiple IDs...' : 'Processing Screenshots...'}
                      </>
                    ) : (
                      <>
                        <Upload className="mr-3 h-5 w-5" />
                        {isMultiScreenshotMode 
                          ? `Extract Data from ${multiScreenshotSets.filter(set => set[1] && set[2]).length} ID Card(s)`
                          : 'Extract Data from Screenshots'
                        }
                      </>
                    )}
                  </Button>
                </form>
              )}

              {/* Points Warning */}
              {userPoints && userPoints.points < files.length && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Shield className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="text-amber-800 font-medium">
                        Insufficient points
                      </p>
                      <p className="text-amber-700 text-sm mt-1">
                        You need {files.length} points but have {userPoints.points}. Contact me{' '}
                        <a href="https://t.me/NatiTG2" className="font-bold underline hover:text-amber-900" target="_blank">
                          Here
                        </a>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <p className="text-red-700 font-medium">{error}</p>
                  </div>
                </div>
              )}
            </div>


            {/* Preview Section - Results List */}
            {allExtractedData.length > 0 && (
              <div className="space-y-8">
                <div className="flex justify-between items-center pb-4 border-b border-gray-200">
                  <h2 className="text-2xl font-bold">Generated ID Cards ({allExtractedData.length})</h2>
                </div>

                {/* Pass all data to a list/consolidated view */}
                <GeneratedIDCardList
                  dataList={allExtractedData}
                  customFrontTemplate={customFrontTemplate}
                  customBackTemplate={customBackTemplate}
                />
              </div>
            )}

            {/* Custom Templates Section */}
            {allExtractedData.length > 0 && (
              <div className="space-y-6 p-6 border-2 border-dashed border-blue-200/50 rounded-2xl bg-gradient-to-r from-blue-50/50 to-indigo-50/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <ImageIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-800">
                    Custom Templates (Optional)
                  </h3>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <Label htmlFor="front-template" className="text-slate-700 font-medium">
                      Front Template
                    </Label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Input
                          id="front-template"
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleTemplateUpload(e, 'front')}
                          className="cursor-pointer border-blue-200 focus:border-blue-400 transition-colors"
                        />
                      </div>
                      {customFrontTemplate && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeCustomTemplate('front')}
                          className="border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {customFrontTemplate && (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Custom front template loaded successfully
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="back-template" className="text-slate-700 font-medium">
                      Back Template
                    </Label>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Input
                          id="back-template"
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleTemplateUpload(e, 'back')}
                          className="cursor-pointer border-blue-200 focus:border-blue-400 transition-colors"
                        />
                      </div>
                      {customBackTemplate && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeCustomTemplate('back')}
                          className="border-red-200 text-red-600 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {customBackTemplate && (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Custom back template loaded successfully
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface GeneratedIDCardListProps {
  dataList: any[];
  customFrontTemplate?: string | null;
  customBackTemplate?: string | null;
}

function GeneratedIDCardList({ dataList, customFrontTemplate, customBackTemplate }: GeneratedIDCardListProps) {
  const [downloadLoading, setDownloadLoading] = useState<boolean>(false);

  // Capture element using html2canvas with mirror effect
  const captureElementAsImage = async (element: HTMLElement): Promise<string | null> => {
    if (!element) return null;

    try {
      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: true,
        scale: 2, // Higher quality
        logging: false,
        backgroundColor: '#ffffff',
        removeContainer: true,
        width: element.offsetWidth,
        height: element.offsetHeight,
        onclone: async (clonedDoc, clonedElement) => {
          // Ensure all images are loaded and handle filters
          const images = Array.from(clonedDoc.querySelectorAll('img'));

          for (const img of images) {
            img.crossOrigin = 'anonymous';

            // Wait for image to load to ensure it's available for canvas drawing
            if (!img.complete) {
              await new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              });
            }

            const filter = img.style.filter;
            if (filter && filter !== 'none') {
              try {
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                const ctx = canvas.getContext('2d');

                if (ctx) {
                  // Apply the filter to the canvas context
                  ctx.filter = filter;
                  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                  // Replace image source with the "baked" filtered image
                  img.src = canvas.toDataURL('image/png');
                  // Remove filter attribute to avoid double filtering if html2canvas ever supports it
                  img.style.filter = 'none';
                }
              } catch (e) {
                console.error('Error applying filter to image during capture:', e);
              }
            }
          }
        }
      });

      // Apply mirror effect (horizontal flip)
      const mirroredCanvas = document.createElement('canvas');
      mirroredCanvas.width = canvas.width;
      mirroredCanvas.height = canvas.height;
      const ctx = mirroredCanvas.getContext('2d');

      if (!ctx) {
        return null;
      }

      // Flip horizontally for printing
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(canvas, 0, 0);

      return mirroredCanvas.toDataURL('image/png', 1.0);

    } catch (error) {
      console.error('Error capturing element:', error);
      return null; // Return null on error so we can skip or handle gracefully
    }
  };

  // Helper function to download blobs
  const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadConsolidatedZIP = async () => {
    try {
      setDownloadLoading(true);
      const zip = new JSZip();

      for (let i = 0; i < dataList.length; i++) {
        const data = dataList[i];
        const frontEl = document.getElementById(`card-front-${i}`);
        const backEl = document.getElementById(`card-back-${i}`);

        if (frontEl && backEl) {
          const [frontImage, backImage] = await Promise.all([
            captureElementAsImage(frontEl),
            captureElementAsImage(backEl)
          ]);

          if (frontImage) {
            const frontBase64 = frontImage.split(',')[1];
            zip.file(`${data.english_name || `card-${i}`}-front.png`, frontBase64, { base64: true });
          }
          if (backImage) {
            const backBase64 = backImage.split(',')[1];
            zip.file(`${data.english_name || `card-${i}`}-back.png`, backBase64, { base64: true });
          }
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(zipBlob, 'consolidated-id-cards.zip');

    } catch (e) {
      console.error(e);
      alert("Failed to generate ZIP");
    } finally {
      setDownloadLoading(false);
    }
  }

  const downloadConsolidatedPDF = async () => {
    try {
      setDownloadLoading(true);
      const pdf = new jsPDF({
        orientation: 'portrait', // A4 Portrait can fit 5 rows? Let's check dimensions.
        // A4 is 210mm x 297mm.
        // Card is typically 85.6mm x 54mm.
        // Scaled aspect ratio: 1280x800 ~ 1.6.
        // If we put Front and Back side-by-side: Width = 85.6 * 2 = 171.2mm + Gap. Fits in 210mm.
        // Height = 54mm. 5 * 54 = 270mm. Fits in 297mm with small margins.
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth(); // 210
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297

      const marginTop = 10;
      const marginSide = 10;
      const gapX = 5;
      const gapY = 2; // tight fit

      // Calculate card dimensions to fit
      // Available width = 210 - 20 = 190.
      // Two cards + gap: 2*w + 5 = 190 => 2w = 185 => w = 92.5mm.
      // Max height per row = (297 - 20) / 5 = 55.4mm.
      // Aspect ratio of card image is 1280/800 = 1.6.
      // If width = 92.5, height = 92.5 / 1.6 = 57.8mm. Too tall for 5 rows (needs 5*57.8 = 289mm, leaving only 8mm margin total).
      // Let's constrain by height to be safe? Or just squeeze margins.
      // If we use height = 53mm. Width = 53 * 1.6 = 84.8mm.
      // 2 * 84.8 + 5 = 174.6mm. Fits easily in width.
      // 5 * 53 = 265mm. Fits in 297mm (leaving 32mm vertical margin).

      const cardHeight = 53;
      const cardWidth = cardHeight * (1280 / 800); // approx 84.8

      // Center horizontally
      const totalRowWidth = (cardWidth * 2) + gapX;
      const startX = (pdfWidth - totalRowWidth) / 2;

      for (let i = 0; i < dataList.length; i++) {
        const frontEl = document.getElementById(`card-front-${i}`);
        const backEl = document.getElementById(`card-back-${i}`);

        if (frontEl && backEl) {
          const [frontImage, backImage] = await Promise.all([
            captureElementAsImage(frontEl),
            captureElementAsImage(backEl)
          ]);

          const y = marginTop + (i * (cardHeight + gapY));

          if (frontImage) {
            pdf.addImage(frontImage, 'PNG', startX, y, cardWidth, cardHeight);
          }
          if (backImage) {
            pdf.addImage(backImage, 'PNG', startX + cardWidth + gapX, y, cardWidth, cardHeight);
          }
        }
      }

      pdf.save('consolidated-id-cards.pdf');

    } catch (e) {
      console.error(e);
      alert("Failed to generate PDF");
    } finally {
      setDownloadLoading(false);
    }
  }

  return (
    <div className="space-y-12">

      {/* Bulk Action Header */}
      <div className="sticky top-4 z-50 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-blue-100 flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold text-slate-800">Batch Results</h3>
          <p className="text-sm text-slate-500">{dataList.length} Cards Generated</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={downloadConsolidatedZIP}
            disabled={downloadLoading}
            className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25"
          >
            {downloadLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Zipping...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download All ZIP
              </>
            )}
          </Button>
          <Button
            onClick={downloadConsolidatedPDF}
            disabled={downloadLoading}
            className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/25"
          >
            {downloadLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating A4 PDF...
              </>
            ) : (
              <>
                <Printer className="mr-2 h-4 w-4" />
                Print All to A4 (Front & Back)
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-16">
        {dataList.map((data, index) => (
          <div key={index} className="space-y-4 border-t border-dashed border-gray-300 pt-8 first:border-0 first:pt-0">
            <div className="flex items-center gap-2 mb-4">
              <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">#{index + 1}</span>
              <span className="font-semibold text-slate-700">{data.english_name || 'Unknown Name'}</span>
            </div>
            <GeneratedIDCardPreview
              data={data}
              index={index}
              customFrontTemplate={customFrontTemplate}
              customBackTemplate={customBackTemplate}
            />
          </div>
        ))}
      </div>
    </div>
  );
}


interface ExtractedData {
  english_name: string;
  english_nationality: string;
  english_gender: string;
  english_sub_city: string;
  english_city: string;
  english_woreda: string;
  birth_date_ethiopian: string;
  birth_date_gregorian: string;
  amharic_gender: string;
  amharic_city: string;
  amharic_sub_city: string;
  amharic_nationality: string;
  amharic_name: string;
  amharic_woreda: string;
  issue_date_gregorian: string;
  issue_date_ethiopian: string;
  phone_number: string;
  expiry_date_gregorian: string;
  expiry_date_ethiopian: string;
  fcn_id: string;
  fin_number: string;
  images: string[];
}

interface GeneratedIDCardPreviewProps {
  data: ExtractedData;
  index: number;
  customFrontTemplate?: string | null;
  customBackTemplate?: string | null;
}

function GeneratedIDCardPreview({ data, index, customFrontTemplate, customBackTemplate }: GeneratedIDCardPreviewProps) {
  const [selectedProfileImage, setSelectedProfileImage] = useState<string>((data.images && data.images.length > 1) ? data.images[1] : (data.images?.[0] || ''));
  const [selectedMiniProfileImage, setSelectedMiniProfileImage] = useState<string>(data.images?.[0] || '');
  const [selectedQRCodeImage, setSelectedQRCodeImage] = useState<string>(data.images?.[2] || '');
  const [serialNumber, setSerialNumber] = useState<string>(generateRandomSerial());
  const [hue, setHue] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(100);
  const [lightness, setLightness] = useState<number>(100);
  const [contrast, setContrast] = useState<number>(100);
  const [grayscale, setGrayscale] = useState<number>(0);
  const [sepia, setSepia] = useState<number>(0);

  const defaultFrontImageUrl = '/front-template.jpg';
  const defaultBackImageUrl = '/back-template.jpg';

  const frontImageUrl = customFrontTemplate || defaultFrontImageUrl;
  const backImageUrl = customBackTemplate || defaultBackImageUrl;

  // We assign IDs to these divs so parent can find them
  const frontCardId = `card-front-${index}`;
  const backCardId = `card-back-${index}`;

  function generateRandomSerial(): string {
    return Math.floor(1000000 + Math.random() * 9000000).toString();
  }

  // Get FCN ID for barcode
  const fcnId = data.fcn_id ? data.fcn_id.replace(/\s/g, '') : '4017497305237984';

  // Update selected images when data changes
  useEffect(() => {
    if (data.images && data.images.length > 0) {
      // Use setTimeout to avoid synchronous setState calls
      setTimeout(() => {
        setSelectedProfileImage(data.images.length > 1 ? data.images[1] : data.images[0]);
        setSelectedMiniProfileImage(data.images[0]);
        if (data.images.length > 2) {
          setSelectedQRCodeImage(data.images[2]);
        }
        setSerialNumber(generateRandomSerial());
      }, 0);
    }
  }, [data.images]);

  return (
    <div className="space-y-8 ">
      {/* Customization Panel */}
      {data.images && data.images.length > 0 && (
        <div className="space-y-6 p-6 border border-slate-200 rounded-xl bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Main Profile Image Selector */}
            <div className="space-y-2">
              <Label htmlFor={`profile-image-select-${index}`} className="text-xs font-bold text-slate-500 uppercase">
                Main Profile
              </Label>
              <select
                id={`profile-image-select-${index}`}
                value={selectedProfileImage}
                onChange={(e) => setSelectedProfileImage(e.target.value)}
                className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              >
                {data.images.map((image: string, idx: number) => (
                  <option key={idx} value={image}>
                    {idx === 1 ? 'Default Profile (Image 2)' : (idx === 0 ? 'Image 1' : `Image ${idx + 1}`)}
                  </option>
                ))}
              </select>
            </div>

            {/* Mini Profile Image Selector */}
            <div className="space-y-2">
              <Label htmlFor={`mini-profile-select-${index}`} className="text-xs font-bold text-slate-500 uppercase">
                Mini Profile
              </Label>
              <select
                id={`mini-profile-select-${index}`}
                value={selectedMiniProfileImage}
                onChange={(e) => setSelectedMiniProfileImage(e.target.value)}
                className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              >
                {data.images.map((image: string, idx: number) => (
                  <option key={idx} value={image}>
                    {idx === 0 ? 'Default Profile' : `Image ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* QR Code Image Selector */}
            <div className="space-y-2">
              <Label htmlFor={`qr-code-select-${index}`} className="text-xs font-bold text-slate-500 uppercase">
                QR Code
              </Label>
              <select
                id={`qr-code-select-${index}`}
                value={selectedQRCodeImage}
                onChange={(e) => setSelectedQRCodeImage(e.target.value)}
                className="w-full p-2 text-sm border border-slate-200 rounded-lg bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
              >
                {data.images.map((image: string, idx: number) => (
                  <option key={idx} value={image}>
                    {idx === 2 ? 'Default QR Code' : `Image ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Serial Number Control */}
            <div className="space-y-2">
              <Label htmlFor={`serial-number-${index}`} className="text-xs font-bold text-slate-500 uppercase">
                Serial Number
              </Label>
              <div className="flex gap-2">
                <Input
                  id={`serial-number-${index}`}
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="flex-1 h-9 text-sm border-slate-200 focus:border-blue-400"
                  placeholder="Enter serial number"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSerialNumber(generateRandomSerial())}
                  className="h-9 border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  Random
                </Button>
              </div>
            </div>
          </div>

          {/* HSL Controls */}
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h4 className="text-sm font-bold text-slate-500 uppercase mb-4">Image Adjustments (HSL)</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor={`hue-${index}`} className="text-xs font-bold text-slate-500 uppercase">Hue Rotation</Label>
                  <span className="text-xs font-mono text-slate-400">{hue}°</span>
                </div>
                <input
                  id={`hue-${index}`}
                  type="range"
                  min="0"
                  max="360"
                  value={hue}
                  onChange={(e) => setHue(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor={`saturation-${index}`} className="text-xs font-bold text-slate-500 uppercase">Saturation</Label>
                  <span className="text-xs font-mono text-slate-400">{saturation}%</span>
                </div>
                <input
                  id={`saturation-${index}`}
                  type="range"
                  min="0"
                  max="200"
                  value={saturation}
                  onChange={(e) => setSaturation(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor={`lightness-${index}`} className="text-xs font-bold text-slate-500 uppercase">Brightness</Label>
                  <span className="text-xs font-mono text-slate-400">{lightness}%</span>
                </div>
                <input
                  id={`lightness-${index}`}
                  type="range"
                  min="0"
                  max="200"
                  value={lightness}
                  onChange={(e) => setLightness(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor={`contrast-${index}`} className="text-xs font-bold text-slate-500 uppercase">Contrast</Label>
                  <span className="text-xs font-mono text-slate-400">{contrast}%</span>
                </div>
                <input
                  id={`contrast-${index}`}
                  type="range"
                  min="0"
                  max="200"
                  value={contrast}
                  onChange={(e) => setContrast(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor={`grayscale-${index}`} className="text-xs font-bold text-slate-500 uppercase">Grayscale</Label>
                  <span className="text-xs font-mono text-slate-400">{grayscale}%</span>
                </div>
                <input
                  id={`grayscale-${index}`}
                  type="range"
                  min="0"
                  max="100"
                  value={grayscale}
                  onChange={(e) => setGrayscale(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor={`sepia-${index}`} className="text-xs font-bold text-slate-500 uppercase">Sepia</Label>
                  <span className="text-xs font-mono text-slate-400">{sepia}%</span>
                </div>
                <input
                  id={`sepia-${index}`}
                  type="range"
                  min="0"
                  max="100"
                  value={sepia}
                  onChange={(e) => setSepia(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setHue(0);
                  setSaturation(100);
                  setLightness(100);
                  setContrast(100);
                  setGrayscale(0);
                  setSepia(0);
                }}
                className="text-xs text-slate-500 hover:text-blue-600"
              >
                Reset Adjustments
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Template Notice */}
      {(customFrontTemplate || customBackTemplate) && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <p className="text-blue-700 text-sm">
              Using custom template{customFrontTemplate && customBackTemplate ? 's' : ''}:
              {customFrontTemplate && ' Front'}
              {customFrontTemplate && customBackTemplate && ' and'}
              {customBackTemplate && ' Back'}
            </p>
          </div>
        </div>
      )}

      {/* Preview Cards - Kept original high-res dimensions but scaled down slightly with CSS transform for preview if needed, or just scrolling */}
      <div className="space-y-8 flex flex-col items-center">
        {/* Front Card */}
        <div className="w-full overflow-x-auto pb-4">
          <div className="min-w-[1280px] transform scale-75 origin-top-left sm:scale-100">
            {/* Wrapper for capture */}
            <div id={frontCardId}
              className="relative border-2 border-gray-300 bg-cover bg-center bg-no-repeat shadow-lg"
              style={{
                height: '800px',
                width: '1280px',
                backgroundImage: `url("${frontImageUrl}")`
              }}
            >
              {/* Profile Images */}
              {data.images && data.images.length > 0 && (
                <>
                  <img crossOrigin="anonymous"
                    width={440}
                    height={540}
                    src={selectedProfileImage.startsWith('/') ? selectedProfileImage : `https://api.affiliate.pro.et/${selectedProfileImage}`}
                    alt="Profile"
                    className="absolute"
                    style={{
                      top: '200px',
                      left: '55px',
                      width: '440px',
                      height: '540px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      filter: `hue-rotate(${hue}deg) saturate(${saturation}%) brightness(${lightness}%) contrast(${contrast}%) grayscale(${grayscale}%) sepia(${sepia}%)`
                    }}
                  />
                  <img crossOrigin="anonymous"
                    width={100}
                    height={130}
                    src={selectedMiniProfileImage.startsWith('/') ? selectedMiniProfileImage : `https://api.affiliate.pro.et/${selectedMiniProfileImage}`}
                    alt="Profile"
                    className="absolute"
                    style={{
                      bottom: '70px',
                      right: '150px',
                      width: '100px',
                      height: '130px',
                      objectFit: 'fill',
                      borderRadius: '4px'
                    }}
                  />
                </>
              )}

              {/* Dynamic Barcode */}
              <div className="absolute" style={{ top: '620px', left: '570px' }}>
                <div style={{
                  backgroundColor: 'white',
                  padding: '10px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  position: 'relative',
                  zIndex: 10
                }}>
                  {/* FCN ID Text - More explicit styling */}
                  <div style={{
                    fontWeight: 'bold',
                    fontSize: '24px',
                    letterSpacing: '5px',
                    textAlign: 'center',
                    marginBottom: '2px',
                    color: '#000000', // Explicit black color
                    fontFamily: 'Arial, sans-serif', // Explicit font family
                    lineHeight: '1.2',
                    background: 'white',
                    padding: '2px 5px',
                    borderRadius: '2px',
                    zIndex: 100,
                    position: 'relative'
                  }}>
                    {data.fcn_id || '4017 4973 0523 7984'}
                  </div>

                  {/* Barcode with explicit styling */}
                  <div style={{
                    background: 'white',
                    padding: '5px',
                    borderRadius: '2px'
                  }}>
                    <Barcode
                      value={fcnId}
                      width={2.6}
                      height={50}
                      fontSize={16}
                      format="CODE128"
                      displayValue={false}
                      background="white"
                      lineColor="#000000" // Explicit black
                      margin={10}
                    />
                  </div>
                </div>
              </div>

              {/* Full Name Data */}
              <div className="absolute leading-11" style={{ top: '210px', left: '510px' }}>
                <div className="amharic-text text-[34px] font-bold text-black">{data.amharic_name || 'የኃለሽት አየለ ጉብረሖት'}</div>
                <div className="english-text text-[34px] font-bold text-black">{data.english_name || 'Yehualeshet Ayele Gebrehot'}</div>
              </div>

              {/* Date of Birth Data */}
              <div className="absolute" style={{ top: '374px', left: '512px' }}>
                <div className="amharic-text text-[34px] font-bold text-black">
                  {data.birth_date_ethiopian || '11/06/1991'} | {data.birth_date_gregorian || '1999/Feb/18'}
                </div>
              </div>

              {/* Sex Data */}
              <div className="absolute" style={{ top: '457px', left: '512px' }}>
                <div className="amharic-text text-[34px] font-bold text-black">
                  {data.amharic_gender || 'ሴት'} | {data.english_gender || 'Female'}
                </div>
              </div>

              {/* Date of Issue Data */}
              <div className="absolute" style={{ top: '560px', left: '26px' }}>
                <div className="amharic-text rotate-270 text-[28px] font-bold text-black transform  origin-left">
                  {data.issue_date_ethiopian || '2018/03/08'}
                </div>
              </div>

              <div className="absolute" style={{ top: '200px', left: '26px' }}>
                <div className="english-text rotate-270 text-[28px] font-bold text-black transform  origin-left">
                  {data.issue_date_gregorian || '2025/Nov/17'}
                </div>
              </div>

              {/* Date of Expiry Data */}
              <div className="absolute" style={{ top: '542px', left: '512px' }}>
                <div className="amharic-text text-[34px] font-bold text-black">
                  {data.expiry_date_ethiopian || '2026/03/08'} | {data.expiry_date_gregorian || '2033/Nov/17'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Back Card */}
        <div className="w-full overflow-x-auto pb-4">
          <div className="min-w-[1280px] transform scale-75 origin-top-left sm:scale-100">
            <div id={backCardId}
              className="relative border-2 border-gray-300 bg-cover bg-center bg-no-repeat shadow-lg"
              style={{
                height: '800px',
                width: '1280px',
                backgroundImage: `url("${backImageUrl}")`
              }}
            >
              {/* Phone Number Data */}
              <div
                className="english-text absolute"
                style={{
                  margin: '0px',
                  fontWeight: "bold",
                  fontSize: '32px',
                  lineHeight: '1.15',
                  letterSpacing: '0.5px',
                  color: 'rgb(0, 0, 0)',
                  top: '93px',
                  left: '40px'
                }}>
                {data.phone_number || '0984124132'}
              </div>

              {/* Address Data */}
              <div className="text-black font-bold absolute" style={{ left: '43px', top: '290px' }}>
                <div className="amharic-text" style={{ fontSize: "32px", fontWeight: "bold", marginBottom: '-10px' }}>
                  {data.amharic_city || 'አማራ'}
                </div>
                <div className="english-text margin_bottom" style={{ fontSize: "32px", fontWeight: "bold", marginBottom: '20px' }}>
                  {data.english_city || 'Amhara'}
                </div>
                <div className="amharic-text" style={{ fontSize: "32px", fontWeight: "bold", marginBottom: '-10px' }}>
                  {data.amharic_sub_city || 'ባህር ዳር ልዩ ዞን'}
                </div>
                <div className="english-text margin_bottom" style={{ fontSize: "32px", fontWeight: "bold", marginBottom: '20px' }}>
                  {data.english_sub_city || 'Bahir Dar Special Zone'}
                </div>
                <div className="amharic-text" style={{ fontSize: "32px", fontWeight: "bold", marginBottom: '-10px' }}>
                  {data.amharic_woreda || 'ዳግማዊ ሚኒሊክ'}
                </div>
                <div className="english-text margin_bottom" style={{ fontSize: "32px", fontWeight: "bold", marginBottom: '20px' }}>
                  {data.english_woreda || 'Dagmawi Minilik'}
                </div>
              </div>

              {/* FIN Number */}
              <div className="absolute" style={{
                fontWeight: 700,
                fontSize: '30px',
                lineHeight: '10px',
                letterSpacing: '0px',
                color: 'rgb(0, 0, 0)',
                bottom: '113px',
                left: '171px'
              }}>
                {data.fin_number || '6725-6073-1762'}
              </div>

              {/* Additional Number */}
              <div style={{
                fontWeight: "bold",
                fontSize: '28px',
                lineHeight: '1.6',
                letterSpacing: '2px',
                color: 'rgb(0, 0, 0)',
                position: 'absolute',
                left: '1070px',
                bottom: '27px'
              }}>
                {serialNumber}
              </div>

              {/* QR Code */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                position: 'absolute',
                top: '40px',
                right: '38px',
                width: '666px',
                height: '650px',
                backgroundColor: 'rgb(255, 255, 255)'
              }}>
                <img crossOrigin="anonymous"
                  width={690}
                  height={690}
                  src={selectedQRCodeImage.startsWith('/') ? selectedQRCodeImage : `https://api.affiliate.pro.et/${selectedQRCodeImage}`}
                  alt="QR Code"
                  style={{
                    width: '690px',
                    height: '690px',
                    objectFit: 'contain'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}