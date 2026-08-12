import { Check, Crown, Sparkles, Zap } from "lucide-react";
import { Button } from "../../components/ui/button";
import useScrollReveal from "../../hooks/useScrollReveal";

const plans = [
    {
        name: "Free",
        price: "$0",
        period: "forever",
        description: "Perfect for getting started",
        icon: Zap,
        features: [
            "Up to 10 contacts",
            "Basic AI messages",
            "Email reminders",
            "5 card templates",
            "Standard support",
        ],
        cta: "Get Started",
        variant: "outline" as const,
        popular: false,
    },
    {
        name: "Pro",
        price: "$9",
        period: "/month",
        description: "For the thoughtful ones",
        icon: Sparkles,
        features: [
            "Unlimited contacts",
            "Advanced AI personalization",
            "WhatsApp automation",
            "50+ card designs",
            "Festival auto-wishes",
            "Priority support",
        ],
        cta: "Start Pro Trial",
        variant: "hero" as const,
        popular: true,
    },
    {
        name: "Ultra",
        price: "$19",
        period: "/month",
        description: "For relationship masters",
        icon: Crown,
        features: [
            "Everything in Pro",
            "Premium card styles",
            "Custom card designer",
            "Multilingual wishes",
            "Team collaboration",
            "API access",
            "Dedicated support",
        ],
        cta: "Go Ultra",
        variant: "outline" as const,
        popular: false,
    },
];

const Pricing = () => {
    const { ref: headerRef, isVisible: headerVisible } = useScrollReveal();
    const { ref: gridRef, isVisible: gridVisible } = useScrollReveal({ threshold: 0.1 });

    return (
        <section id="pricing" className="relative py-24 overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 bg-gradient-to-b from-background via-muted/10 to-background" />
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[150px]" />
            <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[150px]" />

            <div className="relative z-10 max-w-7xl mx-auto px-6">
                <div
                    ref={headerRef as React.RefObject<HTMLDivElement>}
                    className={`text-center space-y-4 mb-16 scroll-reveal ${headerVisible ? 'visible' : ''}`}
                >
                    <span className="inline-block px-4 py-1.5 rounded-full text-sm font-medium bg-primary/10 text-primary border border-primary/20">
                        Pricing
                    </span>
                    <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold">
                        Simple, <span className="gradient-text">Transparent</span> Pricing
                    </h2>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Choose the plan that fits your needs. Cancel anytime.
                    </p>
                </div>

                <div
                    ref={gridRef as React.RefObject<HTMLDivElement>}
                    className={`grid md:grid-cols-3 gap-8 max-w-5xl mx-auto scroll-reveal-stagger ${gridVisible ? 'visible' : ''}`}
                >
                    {plans.map((plan) => (
                        <div
                            key={plan.name}
                            className={`relative glass-card p-8 transition-all duration-300 hover:-translate-y-2 ${plan.popular
                                ? "border-primary/50 shadow-lg shadow-primary/20"
                                : "hover:border-border/80"
                                }`}
                        >
                            {/* Popular badge */}
                            {plan.popular && (
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-primary to-secondary text-xs font-bold text-white">
                                    Most Popular
                                </div>
                            )}

                            {/* Icon */}
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${plan.popular
                                ? "bg-gradient-to-br from-primary to-secondary"
                                : "bg-muted border border-border"
                                }`}>
                                <plan.icon className={`w-7 h-7 ${plan.popular ? "text-white" : "text-foreground"}`} />
                            </div>

                            {/* Plan details */}
                            <h3 className="text-2xl font-display font-bold text-foreground mb-1">
                                {plan.name}
                            </h3>
                            <p className="text-muted-foreground text-sm mb-4">
                                {plan.description}
                            </p>

                            {/* Price */}
                            <div className="mb-6">
                                <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                                <span className="text-muted-foreground">{plan.period}</span>
                            </div>

                            {/* Features */}
                            <ul className="space-y-3 mb-8">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-start gap-3">
                                        <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${plan.popular
                                            ? "bg-primary/20"
                                            : "bg-muted"
                                            }`}>
                                            <Check className={`w-3 h-3 ${plan.popular ? "text-primary" : "text-muted-foreground"}`} />
                                        </div>
                                        <span className="text-sm text-muted-foreground">{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            {/* CTA */}
                            <Button variant={plan.variant} size="lg" className="w-full">
                                {plan.cta}
                            </Button>

                            {/* Glow for popular */}
                            {plan.popular && (
                                <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-r from-primary to-secondary opacity-20 -z-10 blur-xl" />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Pricing;
