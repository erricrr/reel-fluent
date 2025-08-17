"use client";
import React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export default function TermsPage() {
  const router = useRouter();

  const handleClose = () => {
    router.push('/');
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-foreground">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Terms of Service</h1>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-10 w-10 rounded-full hover:bg-secondary"
          aria-label="Close Terms of Service"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="space-y-6 text-sm">
        <p>Welcome to ReelFluent. By accessing or using our service, you agree to comply with and be bound by the following terms and conditions. Please read them carefully.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">1. Acceptance of Terms</h2>
        <p>By using ReelFluent, you agree to these Terms of Service and all applicable laws and regulations. If you do not agree, please do not use our service.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">2. Service Description</h2>
        <p>ReelFluent is a language learning platform that provides tools for practicing listening comprehension and transcription skills. Our services include:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Audio and video transcription tools for language learning purposes</li>
          <li>Translation features to support language comprehension</li>
          <li>Feedback mechanisms to compare your transcriptions with automated transcriptions</li>
          <li>Clip segmentation for more focused language practice</li>
        </ul>
        <p>We do not host or provide copyrighted content. Users are responsible for ensuring their uploaded content complies with copyright laws.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">3. User Responsibilities</h2>
        <ul className="list-disc ml-6 space-y-2">
          <li>You are responsible for any content you upload or process using ReelFluent, including obtaining any necessary permissions for copyrighted material.</li>
          <li>You should only upload content that you have the legal right to use for language learning purposes.</li>
          <li>You must not use ReelFluent for any unlawful or prohibited purpose.</li>
          <li>You agree not to attempt to gain unauthorized access to any part of the service.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">4. Intellectual Property</h2>
        <p>All content and materials provided by ReelFluent, including software, design, and branding, are the property of ReelFluent and protected by intellectual property laws. You may not reproduce, distribute, or create derivative works without permission.</p>
        <p>The transcriptions, translations, and feedback generated using our service are provided for your personal language learning purposes only.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">5. Content Guidelines</h2>
        <p>ReelFluent is designed for language learning purposes. When uploading media content:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>You confirm you have the legal right to use the uploaded content for personal language learning purposes.</li>
          <li>You understand that ReelFluent processes but does not permanently store your uploaded media files.</li>
          <li>You agree not to upload content that contains explicit, offensive, or illegal material.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">6. Disclaimer</h2>
        <p>ReelFluent is provided "as is" and without warranties of any kind. We do not guarantee the accuracy, reliability, or availability of the service. Automated transcriptions and translations are provided as learning aids and may contain errors.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">7. Limitation of Liability</h2>
        <p>ReelFluent shall not be liable for any damages arising from your use of the service, including but not limited to direct, indirect, incidental, or consequential damages.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">8. Changes to Terms</h2>
        <p>We reserve the right to update these Terms of Service at any time. Continued use of ReelFluent after changes constitutes acceptance of the new terms.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">9. Beta Testing</h2>
        <p>Please note that ReelFluent is currently in beta testing. Features may change, and functionality may be limited or modified during this testing period.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">10. Contact</h2>
        <p>If you have any questions about these Terms, please contact us at <a href="mailto:voicevoz321@gmail.com" className="text-primary hover:underline">voicevoz321@gmail.com</a>.</p>
      </div>
    </div>
  );
}
