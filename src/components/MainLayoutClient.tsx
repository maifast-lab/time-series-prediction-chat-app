"use client";

import { useEffect, useState, useTransition } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import MainLayoutSidebar from "@/components/main-layout/MainLayoutSidebar";
import SidebarToggleButton from "@/components/main-layout/SidebarToggleButton";
import type { UploadStep } from "@/components/main-layout/types";
import { API_BASE_URL } from "@/lib/api-base-url";
import { ApiClientError, requestApi } from "@/lib/api-client";
import {
  AUTH_STATE_CHANGED_EVENT,
  clearStoredAuth,
  getStoredAuth,
  signOut,
  type StoredAuthState,
} from "@/lib/auth-client";
import type { ChatSummary } from "@/lib/chat-types";
import { logger } from "@/lib/logger";

interface MainLayoutClientProps {
  children: React.ReactNode;
  initialChats: ChatSummary[];
}

function getActiveChatId(params: ReturnType<typeof useParams>) {
  if (typeof params?.id === "string") {
    return params.id;
  }
  if (Array.isArray(params?.id)) {
    return params.id[0] ?? null;
  }
  return null;
}
export default function MainLayoutClient({
  children,
  initialChats,
}: MainLayoutClientProps) {
  const [chats, setChats] = useState(initialChats);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [progressMessage, setProgressMessage] = useState("");
  const [authState, setAuthState] = useState<StoredAuthState | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isCreatingChat, startCreateTransition] = useTransition();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const activeChatId = getActiveChatId(params);
  const isSuggestionPage = pathname === "/share-suggestion";
  const apiHostLabel = API_BASE_URL.replace(/^https?:\/\//, "");

  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  useEffect(() => {
    function handleChatRenamed(event: Event) {
      const detail = (
        event as CustomEvent<{
          chatId: string;
          company: string;
        }>
      ).detail;

      if (!detail?.chatId || !detail.company) {
        return;
      }

      setChats((prev) =>
        prev.map((chat) =>
          chat._id === detail.chatId
            ? { ...chat, company: detail.company }
            : chat,
        ),
      );
    }

    window.addEventListener("chat-renamed", handleChatRenamed);
    return () => window.removeEventListener("chat-renamed", handleChatRenamed);
  }, []);

  useEffect(() => {
    function syncAuthState() {
      setAuthState(getStoredAuth());
      setIsAuthLoading(false);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key && !event.key.startsWith("maifast.auth.")) {
        return;
      }

      syncAuthState();
    }

    syncAuthState();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, syncAuthState);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, syncAuthState);
    };
  }, []);

  function closeSidebarOnMobile() {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }

  function redirectToLoginIfUnauthorized(error: unknown) {
    if (error instanceof ApiClientError && error.status === 401) {
      clearStoredAuth();
      setAuthState(null);
      router.push("/login");
      return true;
    }

    return false;
  }

  function logHandledApiFailure(message: string, error: ApiClientError) {
    logger.warn(message, {
      status: error.status,
      error: error.message,
    });
  }

  function handleOpenSignIn() {
    router.push("/login");
  }

  function handleOpenChat(chatId: string) {
    router.push(`/c/${chatId}`);
    closeSidebarOnMobile();
  }

  function handleOpenSheetEditor() {
    router.push("/edit/sheet");
    closeSidebarOnMobile();
  }

  function handleOpenSuggestionPage() {
    router.push("/share-suggestion");
    closeSidebarOnMobile();
  }

  function handleDownloadSample() {
    console.log("Dummy CSV download started");
    toast.info("Dummy CSV download started.", {
      description: "Use the sample file to test upload and chat flows.",
    });
  }

  function handleCreateChat() {
    startCreateTransition(async () => {
      try {
        const chat = await requestApi<ChatSummary>("/api/chats", {
          method: "POST",
        });

        router.push(`/c/${chat._id}`);
        closeSidebarOnMobile();
      } catch (error) {
        if (redirectToLoginIfUnauthorized(error)) {
          return;
        }

        if (error instanceof ApiClientError) {
          logHandledApiFailure("New chat creation failed", error);
          return;
        }

        logger.error("New chat creation failed", error);
      }
    });
  }

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await signOut();
      setAuthState(null);
      router.push("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  async function handleDeleteChat(chatId: string) {
    if (!window.confirm("Are you sure you want to delete this chat?")) {
      return;
    }

    try {
      await requestApi<null>(`/api/chats/${chatId}`, {
        method: "DELETE",
      });
    } catch (error) {
      if (redirectToLoginIfUnauthorized(error)) {
        return;
      }

      if (error instanceof ApiClientError) {
        logHandledApiFailure("Delete failed", error);
        return;
      }

      logger.error("Delete failed", error);
      return;
    }

    setChats((prev) => prev.filter((chat) => chat._id !== chatId));

    if (activeChatId === chatId) {
      router.push("/");
      return;
    }

    router.refresh();
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    event.preventDefault();
    const file = event.target.files?.[0];
    if (!file) {
      console.log("File upload cancelled: no file selected");
      return;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    console.log("File upload initiated", buffer);
    const uploadToastId = toast.loading("Uploading file...", {
      description: `${file.name} is being analyzed and attached.`,
    });
    console.log("Starting file upload:", {
      fileName: file.name,
      fileType: file.type || "unknown",
      chatId: activeChatId,
    });
    setUploadStep("analyzing");
    setProgressMessage("AI is analyzing format...");
    console.log(authState, "auth state at upload");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("user_id", authState?.user?.id ?? "");

    if (activeChatId) {
      formData.append("chatId", activeChatId);
    }

    

    try {
      await requestApi("/api/data-sources", {
        method: "POST",
        body: formData,
      });

      setUploadStep("processing");
      setProgressMessage("Bulk mapping 100% complete...");

      window.setTimeout(() => {
        const successMessage = activeChatId
          ? `${file.name} is now linked to this chat.`
          : `${file.name} is ready for AI chat.`;

        console.log("File upload completed:", {
          fileName: file.name,
          chatId: activeChatId,
        });

        setUploadStep("success");
        setProgressMessage(successMessage);
        toast.success("Upload complete", {
          id: uploadToastId,
          description: successMessage,
        });
        window.setTimeout(() => setUploadStep("idle"), 3000);
        router.refresh();
        window.dispatchEvent(new Event("datasource-uploaded"));
      }, 800);
    } catch (error) {
      if (redirectToLoginIfUnauthorized(error)) {
        toast.dismiss(uploadToastId);
        setUploadStep("idle");
        return;
      }

      if (error instanceof ApiClientError) {
        logHandledApiFailure("Upload failed", error);
      } else {
        logger.error("Upload failed", error);
      }

      const errorMessage =
        error instanceof Error ? error.message : "Network error.";

      console.error("File upload failed:", {
        fileName: file.name,
        chatId: activeChatId,
        error: errorMessage,
      });

      setUploadStep("error");
      setProgressMessage(errorMessage);
      toast.error("Upload failed", {
        id: uploadToastId,
        description: errorMessage,
      });
      window.setTimeout(() => setUploadStep("idle"), 5000);
    } finally {
      event.target.value = "";
    }
  }

  //  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
  //     console.log('File upload initiated');
  //     console.log('File upload initiated', {
  //       hasFiles: !!event.target.files,
  //       fileCount: event.target.files?.length ?? 0,
  //       firstFileName: event.target.files?.[0]?.name ?? null,
  //     });
  //   }
  return (
    <div className="flex h-screen w-full overflow-hidden bg-transparent font-sans text-slate-900 selection:bg-blue-500/30 dark:text-gray-100">
      <SidebarToggleButton
        isSidebarOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen((open) => !open)}
        className="fixed left-4 top-4 z-[60] rounded-lg border border-slate-200 bg-white/85 p-2 text-slate-500 backdrop-blur-md hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-gray-400 dark:hover:text-white md:hidden"
      />

      <MainLayoutSidebar
        isSidebarOpen={isSidebarOpen}
        isCreatingChat={isCreatingChat}
        chats={chats}
        activeChatId={activeChatId}
        uploadStep={uploadStep}
        progressMessage={progressMessage}
        authState={authState}
        isAuthLoading={isAuthLoading}
        isSigningOut={isSigningOut}
        apiHostLabel={apiHostLabel}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onCreateChat={handleCreateChat}
        onOpenChat={handleOpenChat}
        onDeleteChat={handleDeleteChat}
        onUploadFile={handleFileUpload}
        onDownloadSample={handleDownloadSample}
        onOpenSheetEditor={handleOpenSheetEditor}
        onOpenSuggestionPage={handleOpenSuggestionPage}
        isSuggestionPage={isSuggestionPage}
        onOpenSignIn={handleOpenSignIn}
        onSignOut={handleSignOut}
      />

      <div className="relative flex h-full w-full flex-1 flex-col overflow-hidden">
        {!isSidebarOpen && (
          <SidebarToggleButton
            isSidebarOpen={false}
            onToggle={() => setIsSidebarOpen(true)}
            className="absolute left-4 top-4 z-50 rounded-lg border border-slate-200 bg-white/85 p-2 text-slate-500 backdrop-blur-md transition-colors hover:text-slate-900 dark:border-white/10 dark:bg-white/10 dark:text-gray-400 dark:hover:text-white"
          />
        )}
        {children}
      </div>
    </div>
  );
}
