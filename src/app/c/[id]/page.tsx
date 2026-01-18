'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  Upload,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatValue } from '@/lib/format';

// Types
interface DataPoint {
  date: string;
  value: number;
}
interface Prediction {
  _id: string;
  targetDate: string;
  predictedValue: number;
  algorithmVersion: string;
  basedOnLastDate: string;
  evaluation?: {
    actualValue: number;
    error: number;
    absoluteError: number;
    percentageError: number;
  } | null;
}
interface ChatDetails {
  _id: string;
  company: string;
  place: string;
  frequencyDays?: number;
  lastDate?: string;
  minBound?: number;
  maxBound?: number;
}

export default function ChatPage() {
  const { id } = useParams();
  const [chat, setChat] = useState<ChatDetails | null>(null);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<
    { type: 'system' | 'error' | 'success'; text: string; id: number }[]
  >([]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const addMessage = (type: 'system' | 'error' | 'success', text: string) => {
    setMessages((prev) => {
      const newMessages = [...prev, { type, text, id: Date.now() }];
      return newMessages.slice(-3); // Keep only the last 3 messages
    });
  };

  async function fetchData() {
    try {
      const res = await fetch(`/api/chat/${id}`);
      if (res.ok) {
        const data = await res.json();
        setChat(data.chat);
        setHistory(data.history);
        setPredictions(data.predictions);
        setLoading(false);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    // Check file size (200MB limit)
    const MAX_SIZE = 200 * 1024 * 1024; // 200MB in bytes
    if (file.size > MAX_SIZE) {
      addMessage('error', 'File size exceeds 200MB limit.');
      setUploading(false);
      if (e.target) e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/chat/${id}/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (res.ok) {
        addMessage(
          'success',
          `Ingested ${data.added} records. Skipped ${data.skipped}.`
        );
        await fetchData(); // Refresh data
      } else {
        addMessage('error', data.error);
      }
    } catch (e) {
      addMessage('error', 'Upload failed due to network error.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handlePredict() {
    setPredicting(true);
    try {
      const res = await fetch(`/api/chat/${id}/predict`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        addMessage(
          'success',
          `Prediction Generated: ${formatValue(data.prediction)} for ${
            data.targetDate
          }`
        );
        await fetchData();
      } else {
        addMessage('error', data.error);
      }
    } catch (e) {
      addMessage('error', 'Prediction failed.');
    } finally {
      setPredicting(false);
    }
  }

  // Merge history and predictions for chart
  const chartData = [
    ...history.map((h) => ({ ...h, type: 'history' })),
    ...predictions.map((p) => ({
      date: p.targetDate,
      predicted: p.predictedValue,
      type: 'prediction',
      actual: p.evaluation ? p.evaluation.actualValue : null,
    })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (loading)
    return (
      <MainLayout>
        <div className='flex-1 flex items-center justify-center'>
          <Loader2 className='w-8 h-8 text-blue-500 animate-spin' />
        </div>
      </MainLayout>
    );

  return (
    <MainLayout>
      <div className='flex flex-col h-full'>
        {/* Header */}
        <header className='px-6 py-4 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between z-10'>
          <div>
            <h1 className='text-xl font-bold text-white'>{chat?.company}</h1>
            <div className='flex items-center gap-2 text-sm text-gray-500'>
              <span className='bg-white/5 px-2 py-0.5 rounded text-xs'>
                {chat?.place}
              </span>
              {chat?.frequencyDays && (
                <span className='bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded text-xs'>
                  Freq: {chat.frequencyDays}d
                </span>
              )}
              {chat?.minBound !== undefined && chat.minBound !== null && (
                <span className='bg-green-500/10 text-green-400 px-2 py-0.5 rounded text-xs'>
                  Min: {chat.minBound}
                </span>
              )}
              {chat?.maxBound !== undefined && chat.maxBound !== null && (
                <span className='bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded text-xs'>
                  Max: {chat.maxBound}
                </span>
              )}
            </div>
          </div>
          <div className='flex items-center gap-3'>
            <input
              type='file'
              accept='.csv'
              ref={fileInputRef}
              onChange={handleUpload}
              className='hidden'
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className='flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-medium transition-colors disabled:opacity-50'
            >
              {uploading ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                <Upload className='w-4 h-4' />
              )}
              Upload CSV
            </button>
            <button
              onClick={handlePredict}
              disabled={predicting || history.length === 0}
              className='flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium shadow-lg shadow-blue-900/20 transition-all disabled:opacity-50 disabled:grayscale'
            >
              {predicting ? (
                <Loader2 className='w-4 h-4 animate-spin' />
              ) : (
                <Sparkles className='w-4 h-4' />
              )}
              Predict Next
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className='flex-1 overflow-y-auto p-6 space-y-6'>
          {/* Chart Section */}
          <div className='w-full h-[400px] bg-black/20 border border-white/5 rounded-2xl p-4 relative group flex flex-col'>
            <div className='text-xs font-medium text-gray-500 mb-4 uppercase tracking-wider'>
              Real-time Visualization
            </div>
            <div className='flex-1 min-h-0'>
              {history.length > 0 ? (
                <ResponsiveContainer width='100%' height='100%'>
                  <LineChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray='3 3'
                      stroke='#ffffff10'
                      vertical={false}
                    />
                    <XAxis
                      dataKey='date'
                      stroke='#ffffff30'
                      tick={{ fill: '#ffffff50', fontSize: 10 }}
                      tickFormatter={(str) => format(new Date(str), 'MMM d')}
                    />
                    <YAxis
                      stroke='#ffffff30'
                      tick={{ fill: '#ffffff50', fontSize: 10 }}
                      width={40}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0a0f1e',
                        borderColor: '#ffffff20',
                        borderRadius: '8px',
                      }}
                      itemStyle={{ color: '#ffffff' }}
                      labelStyle={{
                        color: '#ffffff80',
                        marginBottom: '0.5rem',
                      }}
                    />
                    <Line
                      type='monotone'
                      dataKey='value'
                      stroke='#3b82f6'
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: '#fff' }}
                      name='Historical'
                    />
                    <Line
                      type='monotone'
                      dataKey='predicted'
                      stroke='#a855f7'
                      strokeWidth={2}
                      strokeDasharray='5 5'
                      dot={{ r: 4, fill: '#a855f7' }}
                      name='Prediction'
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className='h-full flex flex-col items-center justify-center text-gray-600'>
                  <FileUp className='w-10 h-10 mb-3 opacity-50' />
                  <p className='text-sm'>No data yet. Upload a CSV to begin.</p>
                </div>
              )}
            </div>
          </div>

          {/* Messages / Events Stream */}
          <div className='space-y-4 max-w-3xl mx-auto pb-10'>
            <div className='text-center text-xs text-gray-600 uppercase tracking-widest my-8'>
              Session Activity
            </div>

            <div className='flex gap-4 p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 items-start'>
              <div className='w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5'>
                <Sparkles className='w-4 h-4 text-blue-400' />
              </div>
              <div className='space-y-3 flex-1'>
                <div>
                  <div className='text-sm font-semibold text-blue-200'>
                    Ready to Train
                  </div>
                  <p className='text-sm text-gray-300 mt-1'>
                    Upload your time-series data to begin. The file must have{' '}
                    <code className='bg-black/30 px-1 py-0.5 rounded border border-white/10 text-xs text-blue-300'>
                      date
                    </code>{' '}
                    and{' '}
                    <code className='bg-black/30 px-1 py-0.5 rounded border border-white/10 text-xs text-blue-300'>
                      value
                    </code>{' '}
                    columns.
                  </p>
                </div>

                <a
                  href='/example.csv'
                  download='example.csv'
                  className='inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-xs font-medium text-blue-200 transition-colors'
                >
                  <FileUp className='w-3.5 h-3.5' />
                  Download Example CSV
                </a>
              </div>
            </div>

            {/* Dynamic Messages */}
            <AnimatePresence>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    'flex gap-4 p-4 rounded-xl border',
                    msg.type === 'error'
                      ? 'bg-red-500/10 border-red-500/20'
                      : msg.type === 'success'
                      ? 'bg-green-500/10 border-green-500/20'
                      : 'bg-white/5 border-white/5'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                      msg.type === 'error'
                        ? 'bg-red-500/20'
                        : msg.type === 'success'
                        ? 'bg-green-500/20'
                        : 'bg-gray-500/20'
                    )}
                  >
                    {msg.type === 'error' ? (
                      <AlertCircle className='w-4 h-4 text-red-400' />
                    ) : msg.type === 'success' ? (
                      <CheckCircle2 className='w-4 h-4 text-green-400' />
                    ) : (
                      <Sparkles className='w-4 h-4 text-gray-400' />
                    )}
                  </div>
                  <div className='text-sm text-gray-300 flex items-center'>
                    {msg.text}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Stats Grid (Optional) */}
          {predictions.length > 0 && (
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
              {predictions
                .slice()
                .reverse()
                .map((pred) => (
                  <div
                    key={pred._id}
                    className='p-4 rounded-xl bg-white/5 border border-white/10'
                  >
                    <div className='text-xs text-gray-500 mb-1'>
                      Target: {pred.targetDate}
                    </div>
                    <div className='flex items-baseline gap-2'>
                      <span className='text-lg font-bold text-purple-400'>
                        {formatValue(pred.predictedValue)}
                      </span>
                      {pred.evaluation && (
                        <div className='flex flex-col items-end'>
                          <span className='text-xs text-blue-300'>
                            Act: {formatValue(pred.evaluation.actualValue)}
                          </span>
                          <span
                            className={cn(
                              'text-xs',
                              pred.evaluation.error > 0
                                ? 'text-green-400'
                                : 'text-red-400'
                            )}
                          >
                            Err: {formatValue(pred.evaluation.absoluteError)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
