import Features from "../components/landing/Features";
import FinalCTA from "../components/landing/FinalCTA";
import Footer from "../components/landing/Footer";
import Hero from "../components/landing/Hero";
import HowItWorks from "../components/landing/HowItWorks";
import MessageShowcase from "../components/landing/MessageShowcase";
import Navbar from "../components/landing/Navbar";
import Pricing from "../components/landing/Pricing";
import ProblemStatement from "../components/landing/ProblemStatement";
import Testimonials from "../components/landing/Testmonials";


const Index = () => {
    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <main>
                <Hero />
                <ProblemStatement />
                <HowItWorks />
                <Features />
                <MessageShowcase />
                <Testimonials />
                <Pricing />
                <FinalCTA />
            </main>
            <Footer />
        </div>
    );
};

export default Index;