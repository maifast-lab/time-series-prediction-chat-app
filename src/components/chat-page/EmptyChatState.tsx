import Image from 'next/image';
const logoImg = "/PNG.png";

export default function EmptyChatState() {

  return (
    <div
      key='empty-state'
      className='mx-auto mt-20 max-w-4xl rounded-3xl border border-blue-200 bg-white/75 p-8 text-center shadow-lg shadow-slate-200/60 dark:border-blue-500/10 dark:bg-blue-500/5 dark:shadow-none animate-in fade-in'
    >
    <div className="relative">
                    <Image
                      src={logoImg}
                      alt='Maifast logo'
                      width={200}
                      height={200}
                      className='mx-auto'
                    />
                    <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-5xl">
                      Welcome to Maifast
                    </h1>
                    <p className="mx-auto mt-4 max-4-xl text-base leading-7 text-slate-600 dark:text-slate-300">
                      Manage conversations, automate tasks, and get instant
                      AI-powered insights from one professional workspace.
                    </p>
                  </div>
    </div> 
  );
}
