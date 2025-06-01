import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-foreground">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
      <div className="space-y-6 text-sm">
        <p>At ReelFluent, we are committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our language learning service.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">1. Information Collection</h2>
        <p>When you use ReelFluent, we collect a limited amount of information:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Usage data: Basic information about how you interact with our service.</li>
          <li>Technical information: Browser type, device information, and IP address for service functionality.</li>
          <li>Content you process: The media files you upload for transcription and your transcription inputs are temporarily processed but not permanently collected or stored.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">2. Media Files</h2>
        <p>When you upload media files to ReelFluent:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>We process these files to enable transcription, segmentation, and other language learning features.</li>
          <li>We do not permanently store your uploaded media files on our servers - they are processed and then discarded.</li>
          <li>Any transcriptions or translations you create are only stored temporarily during your session and are discarded when you close the application.</li>
          <li>No content you upload or create persists beyond your current session.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">3. How We Use Your Information</h2>
        <ul className="list-disc ml-6 space-y-2">
          <li>To provide the ReelFluent language learning service.</li>
          <li>To process your media files for transcription and translation.</li>
          <li>To analyze usage patterns and improve our platform for language learning.</li>
          <li>To ensure the security and integrity of our service.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">4. Information Sharing</h2>
        <p>We do not sell or share your information with third parties except in the following limited circumstances:</p>
        <ul className="list-disc ml-6 space-y-2">
          <li>Service providers: To help us deliver aspects of our service (such as cloud hosting, transcription services).</li>
          <li>Legal requirements: When required by law or to protect our rights.</li>
        </ul>

        <h2 className="text-xl font-semibold mt-6 mb-2">5. Data Security</h2>
        <p>We implement basic security measures to protect your information. However, no method of electronic storage or transmission is 100% secure, and we cannot guarantee absolute security.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">6. Children's Privacy</h2>
        <p>ReelFluent is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">7. Beta Testing</h2>
        <p>ReelFluent is currently in beta testing. During this phase, we may collect additional diagnostic information to improve the service. Our privacy practices may evolve as we develop the service.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">8. Changes to Privacy Policy</h2>
        <p>We may update this privacy policy periodically to reflect changes in our practices or for legal reasons. Continued use of ReelFluent after changes constitutes acceptance of the updated policy.</p>

        <h2 className="text-xl font-semibold mt-6 mb-2">9. Contact Us</h2>
        <p>If you have questions or concerns about this Privacy Policy or our privacy practices, please contact us at <a href="mailto:voicevoz321@gmail.com" className="text-primary hover:underline">voicevoz321@gmail.com</a>.</p>
      </div>
    </div>
  );
}
