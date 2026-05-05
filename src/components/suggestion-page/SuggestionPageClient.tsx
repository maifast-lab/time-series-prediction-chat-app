'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lightbulb,
  SendHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';

import { AppPanel, PageBody, PageContainer, SectionTag } from '@/components/AppPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { clearStoredAuth } from '@/lib/auth-client';
import { ApiClientError, requestApi } from '@/lib/api-client';
import { logger } from '@/lib/logger';

interface SuggestionPayload {
  title: string;
  description: string;
}
const INITIAL_SUGGESTION: SuggestionPayload = {
  title: '',
  description: '',
};
export default function SuggestionPageClient() {
  const router = useRouter();
  const [formValues, setFormValues] =
    useState<SuggestionPayload>(INITIAL_SUGGESTION);
  const [isSubmitting, startSubmitTransition] = useTransition();

  function updateField(field: keyof SuggestionPayload, value: string) {
    setFormValues((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      title: formValues.title.trim(),
      description: formValues.description.trim(),
    };

    if (!payload.title || !payload.description) {
      toast.error('Title and description are required.', {
        description: 'Fill both fields before sending your suggestion.',
      });
      return;
    }

    startSubmitTransition(async () => {
      try {
        await requestApi<unknown>('/api/suggestion', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        setFormValues(payload);
        toast.success('Suggestion shared.', {
          description: 'Your feedback was sent to the suggestion endpoint.',
        });
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          clearStoredAuth();
          router.push('/login');
          return;
        }

        if (error instanceof ApiClientError) {
          logger.warn('Suggestion submission failed', {
            status: error.status,
            error: error.message,
          });
        } else {
          logger.error('Suggestion submission failed', error);
        }

        toast.error('Suggestion could not be shared.', {
          description:
            error instanceof Error ? error.message : 'Please try again.',
        });
      }
    });
  }

  return (
    <PageBody>
      <PageContainer className='max-w-6xl'>
        <AppPanel className='rounded-[34px]'>
          <div className='grid gap-6 px-6 py-8 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end'>
            <div className='max-w-3xl'>
              <SectionTag className='inline-flex'>Product feedback</SectionTag>
              <h1 className='mt-5 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl'>
                Share a suggestion with the Maifast team.
              </h1>
              <p className='mt-4 text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base'>
                Use this page to send a focused suggestion with a clear title
                and description. The form starts with your current sample
                content and posts directly to the backend suggestion endpoint.
              </p>
            </div>
          </div>
        </AppPanel>
        <section className='w-full'>
          <AppPanel className='rounded-[28px]'>
            <form onSubmit={handleSubmit} className='px-6 py-6 sm:px-8'>
              <div className='flex items-center gap-3'>
                <div className='flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-200'>
                  <Lightbulb className='size-5' />
                </div>
                <div>
                  <h2 className='text-lg font-semibold text-slate-950 dark:text-white'>
                    Suggestion details
                  </h2>
                  <p className='text-sm text-slate-500 dark:text-slate-400'>
                    Edit the starter content or send it as-is.
                  </p>
                </div>
              </div>

              <div className='mt-8 space-y-6'>
                <div className='space-y-2'>
                  <Label
                    htmlFor='suggestion-title'
                    className='text-slate-900 dark:text-white'
                  >
                    Title
                  </Label>
                  <Input
                    id='suggestion-title'
                    value={formValues.title}
                    onChange={(event) =>
                      updateField('title', event.target.value)
                    }
                    placeholder='Add a concise suggestion title'
                    className='h-12 rounded-2xl bg-white/80 px-4 dark:bg-white/5'
                  />
                </div>

                <div className='space-y-2'>
                  <Label
                    htmlFor='suggestion-description'
                    className='text-slate-900 dark:text-white'
                  >
                    Description
                  </Label>
                  <Textarea
                    id='suggestion-description'
                    value={formValues.description}
                    onChange={(event) =>
                      updateField('description', event.target.value)
                    }
                    placeholder='Describe what should change and why.'
                    className='min-h-40 rounded-[24px] bg-white/80 dark:bg-white/5'
                  />
                </div>
              </div>

              <div className='mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
                <p className='text-sm leading-6 text-slate-500 dark:text-slate-400'>
                  The live payload preview updates as you edit the form.
                </p>

                <Button
                  type='submit'
                  size='lg'
                  disabled={isSubmitting}
                  className='rounded-2xl px-6 shadow-lg shadow-blue-950/15'
                >
                  {isSubmitting ? 'Submitting...' : 'Share suggestion'}
                  <SendHorizontal className='size-4' />
                </Button>
              </div>
            </form>
          </AppPanel>

        </section>
      </PageContainer>
    </PageBody>
  );
}
