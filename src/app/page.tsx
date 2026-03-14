'use client';

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Upload, Download, Loader2, Printer, Coins, Image as ImageIcon, X, Shield, LogOut, Plus, FileText } from "lucide-react";
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

interface ErrorResponse {
  response?: {
    data?: {
      message?: string;
    };
  };
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
  [key: string]: string | string[];
}

// Validation function to check if any required field is null
const validateExtractedData = (data: ExtractedData): boolean => {
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
  const [files, setFiles] = useState<(File | null)[]>([null, null, null, null, null]);
  const [allExtractedData, setAllExtractedData] = useState<ExtractedData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userPoints, setUserPoints] = useState<UserPoints | null>(null);
  const [pointsLoading, setPointsLoading] = useState(true);
  const [customFrontTemplate, setCustomFrontTemplate] = useState<string | null>(null);
  const [customBackTemplate, setCustomBackTemplate] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pdf' | 'screenshot'>('pdf');
  const [screenshotFiles, setScreenshotFiles] = useState<(File | null)[]>([null, null, null]);
  const [isMultiScreenshotMode, setIsMultiScreenshotMode] = useState(true);
  const [multiScreenshotSets, setMultiScreenshotSets] = useState<(File | null)[][]>([]);
  const [activeIdSection, setActiveIdSection] = useState<number | null>(null);
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

  // Ensure screenshot sets exist for active ID section
  useEffect(() => {
    if (activeIdSection && multiScreenshotSets.length < activeIdSection) {
      const newSets = [...multiScreenshotSets];
      for (let i = multiScreenshotSets.length; i < activeIdSection; i++) {
        newSets.push([null, null, null]);
      }
      setMultiScreenshotSets(newSets);
    }
  }, [activeIdSection]);

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

  const handleIdButtonClick = (idNumber: number) => {
    console.log('Clicked ID:', idNumber, 'Current active:', activeIdSection, 'Current sets length:', multiScreenshotSets.length);
    if (activeIdSection === idNumber) {
      setActiveIdSection(null);
    } else {
      setActiveIdSection(idNumber);
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
    const validFiles = files.filter(file => file !== null);
    
    if (validFiles.length === 0) {
      setError("Please select at least one PDF file");
      return;
    }

    if (userPoints && userPoints.points < validFiles.length) {
      setError(`Insufficient points. You need ${validFiles.length} points for ${validFiles.length} files.`);
      return;
    }

    setLoading(true)
    setError(null);
    setAllExtractedData([]);

    const newExtractedData: ExtractedData[] = [];
    const errors: string[] = [];

    try {
      for (const file of validFiles) {
        const formData = new FormData();
        formData.append("file", file!);

        try {
          const response = await axios.post("/api/process-pdf", formData, {
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
          console.error("Error processing file:", err);
          errors.push("Error processing file");
        }
      }

      if (errors.length > 0) {
        setError(errors.join(". "));
      }

      if (newExtractedData.length > 0) {
        setAllExtractedData(newExtractedData);
        fetchUserPoints();
      } else {
        setError("Failed to process any files. Please check your files and try again.");
      }
    } catch (err: unknown) {
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
        const newExtractedData: ExtractedData[] = [];

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
      } catch (err: unknown) {
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
      } catch (err: unknown) {
        console.error("Screenshot upload error:", err);
        const errorMessage = err && typeof err === 'object' && 'response' in err 
          ? (err as ErrorResponse).response?.data?.message || "Screenshot processing failed. Please try again."
          : "Screenshot processing failed. Please try again.";
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8">
                  </div>
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
                </form>
                  <div className="space-y-3">
                    <Label htmlFor="pdf-upload" className="text-slate-700 font-medium text-lg">
                      Upload Multiple PDF Files (Max 5)
                    </Label>
                    <p className="text-slate-500 text-sm">
                      Upload individual PDF files in separate spaces. Each PDF will be processed separately.
                    </p>

                    {/* Multiple Individual PDF Upload Spaces */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3, 4, 5].map((num) => (
                        <div key={num} className="space-y-2">
                          <div className="text-center space-y-1">
                            <Label className="text-teal-600 font-bold text-base block">
                              PDF {num}
                            </Label>
                            <p className="text-slate-500 text-xs">
                              Ethiopian ID Card PDF
                            </p>
                          </div>
                          <div
                            className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all duration-200 h-32 flex flex-col items-center justify-center ${files[num - 1]
                              ? 'border-green-200 bg-green-50'
                              : 'border-blue-100 hover:border-blue-300 bg-slate-50/50'
                              }`}
                            onClick={() => document.getElementById(`pdf-${num}`)?.click()}
                            onDragOver={(e) => handleDragOver(e)}
                            onDragLeave={(e) => handleDragLeave(e)}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const droppedFiles = Array.from(e.dataTransfer.files);
                              if (droppedFiles.length > 0) {
                                const file = droppedFiles[0];
                                if (file.type === 'application/pdf') {
                                  const newFiles = [...files];
                                  newFiles[num - 1] = file;
                                  setFiles(newFiles);
                                } else {
                                  setError('Please drop a PDF file');
                                }
                              }
                            }}
                          >
                            {files[num - 1] ? (
                              <div className="w-full h-full relative">
                                <div className="flex flex-col items-center justify-center h-full">
                                  <FileText className="h-8 w-8 text-green-600 mb-2" />
                                  <span className="text-green-700 font-medium text-xs truncate w-full px-2 text-center">
                                    {files[num - 1]?.name || 'PDF uploaded'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeFile(num - 1);
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 z-10"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                            </div>
                            </div>
                              </div>
                              </div>
                            ) : (
                              <>
                                <Upload className="h-6 w-6 text-blue-200 mb-2" />
                                <div className="bg-slate-200/50 shadow-sm px-3 py-1 rounded-lg text-slate-700 font-medium text-xs hover:bg-slate-200 transition-colors">
                                  Select PDF
                                </div>
                            </div>
                            </div>
                              </>
                            )}
                            </div>
                            <Input
                              type="file"
                              accept="application/pdf"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                const newFiles = [...files];
                                newFiles[num - 1] = file;
                                setFiles(newFiles);
                              }}
                              className="hidden"
                              id={`pdf-${num}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button
                      type="submit"
                      disabled={files.filter(f => f !== null).length === 0 || loading}
                      className="w-full bg-blue-600 mt-4 hover:bg-blue-700 text-white px-8 py-6 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/25"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                          Processing {files.filter(f => f !== null).length} PDF(s)...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-3 h-5 w-5" />
                          Extract Data from {files.filter(f => f !== null).length > 0 ? files.filter(f => f !== null).length : ''} File(s)
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleScreenshotUpload} className="space-y-6">
                  <div className="text-center space-y-2 mb-8">
                    <h2 className="text-xl font-bold text-slate-800">
                      Upload Multiple ID Screenshots from Fayda App
                    </h2>
                    <p className="text-slate-500 text-sm">
                      Upload multiple ID cards at once. Each set needs Image 2 (front) and Image 3 (back). Image 1 (popup) is optional for colored photo.
                    </p>
                    <p className="text-xs text-blue-600 mt-2">
                      Process several ID cards at once (1 point per ID)
                    </p>
                  </div>

                  {/* Multi-ID Mode Interface */}
                  {isMultiScreenshotMode && (
                    <div className="space-y-6 border-t border-blue-100 pt-6">
                  </div>
                  </div>
                      {/* Quick Add Buttons */}
                      <div className="grid grid-cols-5 gap-2">
                        {[1, 2, 3, 4, 5].map((idNum) => (
                          <Button
                            key={idNum}
                            type="button"
                            onClick={() => handleIdButtonClick(idNum)}
                            disabled={multiScreenshotSets.length >= 5}
                            className={`w-full flex items-center justify-center gap-1 ${
                              multiScreenshotSets.length >= 5
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : activeIdSection === idNum
                                ? idNum === 1 
                                  ? 'bg-blue-700 text-white'
                                  : idNum === 2
                                  ? 'bg-purple-700 text-white'
                                  : idNum === 3
                                  ? 'bg-green-700 text-white'
                                  : idNum === 4
                                  ? 'bg-orange-700 text-white'
                                  : 'bg-red-700 text-white'
                                : idNum === 1 
                                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                  : idNum === 2
                                  ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                  : idNum === 3
                                  ? 'bg-green-600 hover:bg-green-700 text-white'
                                  : idNum === 4
                                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                                  : 'bg-red-600 hover:bg-red-700 text-white'
                            }`}
                          >
                            <Plus className="h-3 w-3" />
                            ID {idNum}
                          </Button>
                        ))}
                      </div>

                      {/* Individual ID Sections - Only show active one */}
                      {activeIdSection && (
                        <div className="space-y-6 border-t border-blue-100 pt-6">
