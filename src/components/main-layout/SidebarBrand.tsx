import Image from 'next/image';

export default function SidebarBrand() {
  return (
    <div className='flex items-center justify-center px-2'>
      <Image
        src='/PNG.png'
        width={3153}
        height={853}
        alt='Maifast Logo'
        className='h-10 w-auto shrink-0 object-contain'
        quality={100}
        priority
      />
    </div>
  );
}
